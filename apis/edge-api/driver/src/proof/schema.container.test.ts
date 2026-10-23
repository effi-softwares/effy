import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/** The proof tables' constraints, each proven by violating it, against the real migrations. */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

let stopId: string;
let driverId: string;
let roundId: string;

d("064 — delivery_proof & delivery_attempt_failure constraints", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM public.delivery_proof");
    await pool.query("DELETE FROM public.delivery_attempt_failure");
    await pool.query("DELETE FROM public.round_stop");
    await pool.query("DELETE FROM public.driver_round");
    await pool.query("DELETE FROM public.dispatch_wave");
    await pool.query("DELETE FROM public.driver");
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.customer");

    const drv = await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email)
       VALUES ('sub-proof-1', 'Proof Tester', 'proof-tester@effyshopping.com') RETURNING id`,
    );
    driverId = drv.rows[0]!.id;

    const wave = await pool.query<{ id: string }>(
      `INSERT INTO public.dispatch_wave (kind, planned_for, trigger)
       VALUES ('delivery', now(), 'schedule') RETURNING id`,
    );
    const round = await pool.query<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
       VALUES ($1, $2, 'delivery', now() + interval '6 hours') RETURNING id`,
      [wave.rows[0]!.id, driverId],
    );
    // A `customer_drop` must carry an order and no shop (`round_stop_target_ck`).
    const cust = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email)
       VALUES ('sub-cust-proof-1', 'proof-customer@effyshopping.com') RETURNING id`,
    );
    const order = await pool.query<{ id: string }>(
      `INSERT INTO public."order"
         (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, delivery_type, delivery_type_reason)
       VALUES ($1, 'EFY-PROOF01', 10.00, 12.50,
               '{"line1":"1 Test St","city":"Richmond","postalCode":"3121","region":"VIC"}'::jsonb, 'effy', 'in_coverage')
       RETURNING id`,
      [cust.rows[0]!.id],
    );
    roundId = round.rows[0]!.id;
    const stop = await pool.query<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id)
       VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [roundId, order.rows[0]!.id],
    );
    stopId = stop.rows[0]!.id;
  });

  const insertProof = (method: string, mediaKey: string | null, changeId?: string) =>
    pool.query(
      `INSERT INTO public.delivery_proof
         (stop_id, method, media_key, captured_by_driver_id, captured_at, change_id)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [stopId, method, mediaKey, driverId, changeId ?? crypto.randomUUID()],
    );

  describe("proof method is a closed set", () => {
    it("accepts the three methods this slice ships", async () => {
      await expect(insertProof("photo", "proof/a/1.jpg")).resolves.toBeDefined();
      await pool.query("DELETE FROM public.delivery_proof");
      await expect(insertProof("signature", "proof/a/2.png")).resolves.toBeDefined();
      await pool.query("DELETE FROM public.delivery_proof");
      await expect(insertProof("contactless", null)).resolves.toBeDefined();
    });

    it("⚠ REFUSES `code` — no delivery code exists to verify against (FR-003, research R4)", async () => {
      // No delivery code exists anywhere, so a `code` proof could only compare a value to itself.
      await expect(insertProof("code", null)).rejects.toThrow(/delivery_proof_method_check/);
    });

    it("refuses a method nobody has ever defined", async () => {
      await expect(insertProof("vibes", null)).rejects.toThrow(/delivery_proof_method_check/);
    });
  });

  describe("⚠ FR-006 — a drop can never be delivered against proof that failed to upload", () => {
    it("refuses a photo with no media", async () => {
      await expect(insertProof("photo", null)).rejects.toThrow(
        /delivery_proof_photo_media_check/,
      );
    });

    it("refuses a signature with no media", async () => {
      await expect(insertProof("signature", null)).rejects.toThrow(
        /delivery_proof_signature_media_check/,
      );
    });

    it("allows contactless with no media — the one legitimate case", async () => {
      await expect(insertProof("contactless", null)).resolves.toBeDefined();
    });
  });

  describe("⚠ FR-005 — one delivery per drop, structurally", () => {
    it("refuses a second proof for the same drop", async () => {
      await insertProof("contactless", null);
      // Two devices submitting at once cannot both win: the second row cannot exist.
      await expect(insertProof("photo", "proof/a/3.jpg")).rejects.toThrow(
        /delivery_proof_stop_uq/,
      );
    });

    it("⚠ refuses a replayed changeId on a DIFFERENT drop", async () => {
      // Global: a replayed changeId must not mint proof on another drop.
      const change = crypto.randomUUID();
      await insertProof("contactless", null, change);

      const other = await pool.query<{ id: string }>(
        `INSERT INTO public.round_stop (round_id, kind, order_id)
         SELECT $1, 'customer_drop', order_id FROM public.round_stop WHERE id = $2 RETURNING id`,
        [roundId, stopId],
      );
      await expect(
        pool.query(
          `INSERT INTO public.delivery_proof
             (stop_id, method, media_key, captured_by_driver_id, captured_at, change_id)
           VALUES ($1, 'contactless', NULL, $2, now(), $3)`,
          [other.rows[0]!.id, driverId, change],
        ),
      ).rejects.toThrow(/delivery_proof_change_uq/);
    });
  });

  const insertFailure = (reason: string, note: string | null) =>
    pool.query(
      `INSERT INTO public.delivery_attempt_failure
         (stop_id, reason, note, driver_id, failed_at, change_id)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [stopId, reason, note, driverId, crypto.randomUUID()],
    );

  describe("failure reasons", () => {
    it("accepts every reason in the closed set", async () => {
      for (const r of ["nobody_home", "wrong_address", "customer_refused", "access_blocked"]) {
        await expect(insertFailure(r, null)).resolves.toBeDefined();
      }
      await expect(insertFailure("other", "gate locked, no answer")).resolves.toBeDefined();
    });

    it("refuses a reason outside the set", async () => {
      await expect(insertFailure("could_not_be_bothered", null)).rejects.toThrow(
        /delivery_attempt_failure_reason_check/,
      );
    });

    it("⚠ FR-010 — refuses `other` with no note", async () => {
      await expect(insertFailure("other", null)).rejects.toThrow(
        /delivery_attempt_failure_other_note_check/,
      );
    });

    it("⚠ refuses `other` with a note that is only whitespace", async () => {
      // A required field satisfied by a space is not satisfied.
      await expect(insertFailure("other", "   ")).rejects.toThrow(
        /delivery_attempt_failure_other_note_check/,
      );
    });

    it("⚠ ALLOWS several failures for one drop — deliberately not unique", async () => {
      // A second attempt is a second row; the history is kept.
      await insertFailure("nobody_home", null);
      await insertFailure("nobody_home", null);
      const n = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM public.delivery_attempt_failure WHERE stop_id = $1",
        [stopId],
      );
      expect(n.rows[0]!.count).toBe("2");
    });
  });

  describe("referential integrity", () => {
    it("refuses proof against a drop that does not exist", async () => {
      await expect(
        pool.query(
          `INSERT INTO public.delivery_proof
             (stop_id, method, media_key, captured_by_driver_id, captured_at, change_id)
           VALUES ($1, 'contactless', NULL, $2, now(), $3)`,
          [crypto.randomUUID(), driverId, crypto.randomUUID()],
        ),
      ).rejects.toThrow(/delivery_proof_stop_id_fkey/);
    });
  });
});
