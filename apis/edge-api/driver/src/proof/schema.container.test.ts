import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * 064's two new tables, against real PostgreSQL 16, loaded from the REAL migrations.
 *
 * ⚠ EVERY CONSTRAINT BELOW IS PROVEN BY VIOLATING IT. A `CHECK` nobody has ever tripped is
 * indistinguishable from a `CHECK` that was never written — it passes `tsc`, it applies cleanly, and
 * the first thing it fails to stop is a real one. These constraints are where several of this
 * slice's requirements actually live:
 *
 *   · FR-005 (one delivery per drop, however many times a phone retries)  → `delivery_proof_stop_uq`
 *   · FR-006 (never delivered against proof that failed to upload)        → the media CHECKs
 *   · FR-010 ("other" must say what happened)                             → the note CHECK
 *   · FR-003 (the `code` method is deferred, not half-built)              → the method CHECK
 *
 * ⚠ THE SCHEMA IS NOT TRANSCRIBED. It is read from `db/migrations` by `migrationSql()`. A transcribed
 * schema drifts, and a container test against a schema that no longer exists is worse than no
 * container test, because it looks like proof.
 */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

// A drop to hang proof off: driver → wave → round → stop.
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
    // ⚠ A `customer_drop` MUST carry an order and MUST NOT carry a shop — `round_stop_target_ck`.
    // The first draft of this fixture created a bare stop and all fourteen tests failed identically,
    // which is the loader doing its job: the real constraint is stricter than a transcription would
    // have remembered. (The same CHECK requires a `hub_checkin` to carry NEITHER, which is what makes
    // the hub stop R11 adds representable.)
    const cust = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email)
       VALUES ('sub-cust-proof-1', 'proof-customer@effyshopping.com') RETURNING id`,
    );
    const order = await pool.query<{ id: string }>(
      `INSERT INTO public."order"
         (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address)
       VALUES ($1, 'EFY-PROOF01', 10.00, 12.50,
               '{"line1":"1 Test St","city":"Richmond","postalCode":"3121","region":"VIC"}'::jsonb)
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
      // Not a styling choice. `delivery_code` appears in no service, migration, contract or app, so a
      // `code` proof could only compare a value to itself. The database refuses to hold the state.
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
      // This is SC-007's real guarantee: two devices submitting at once cannot both win, because the
      // second row cannot exist. No application logic is involved.
      await expect(insertProof("photo", "proof/a/3.jpg")).rejects.toThrow(
        /delivery_proof_stop_uq/,
      );
    });

    it("⚠ refuses a replayed changeId on a DIFFERENT drop", async () => {
      // ⚠ THE FIRST VERSION OF THIS TEST WAS WRONG and the container caught it. It inserted, DELETED
      // the row, then re-inserted with the same changeId and expected a violation — but a unique
      // index constrains rows that exist, so deleting the witness makes the replay legitimately
      // succeed. It was asserting something untrue about PostgreSQL.
      //
      // The guarantee that actually matters is GLOBAL: one shopper action can only ever produce one
      // proof, so a replayed changeId must not be able to mint proof somewhere else either.
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
      // The interesting half. A required field a client can satisfy with a space is not required.
      await expect(insertFailure("other", "   ")).rejects.toThrow(
        /delivery_attempt_failure_other_note_check/,
      );
    });

    it("⚠ ALLOWS several failures for one drop — deliberately not unique", async () => {
      // A drop may be attempted more than once, and a second attempt is a second row. Collapsing
      // them would destroy the history FR-012 exists to keep.
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
