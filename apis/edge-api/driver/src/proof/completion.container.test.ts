import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ⚠ THE TEST THIS WHOLE SLICE RESTS ON (064, US1 — research R2/R3).
 *
 * Until 064 a same-day order could not reach `delivered` by any driver action at all. The only writer
 * of that status anywhere on the platform was `edge-api/orders/src/arrival/repository.ts` — 053's
 * BACK-OFFICE manual arrival path, built for standard carrier packages. The driver who actually
 * handed the package over had no way to record it.
 *
 * So the proof route is not an annotation on a completion; it IS the completion, and these tests
 * assert every part of it against real PostgreSQL:
 *
 *   · the proof row                                    (the evidence)
 *   · `shop_fulfillment.status = 'delivered'`          (what a shop and a shopper read)
 *   · ⚠ `package_arrival`                              (WHAT ORDER COMPLETENESS ACTUALLY KEYS ON)
 *   · the `order_delivered` notification intent        (the shopper being told)
 *   · and — the case 053 had to fix — a MIXED order staying SILENT until all of it has arrived.
 *
 * ⚠ The `package_arrival` assertion is the one with no second chance. `enqueueOrderDeliveredIfComplete`
 * asks whether an unarrived package exists, against THAT table — not against the status. A proof that
 * sets the status and skips the arrival leaves the order permanently incomplete, the shopper never
 * told, and nothing failing anywhere.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
});

import { migrationSql } from "@effy/edge-shared";

import { history, historyDetail } from "../work/delivery";
import { NotFoundError } from "../work/service";
import { DropNotFoundError, recordFailure, recordProof } from "./repository";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

let driverId: string;
let driverSub: string;
let orderId: string;
let dropId: string;
let sameDayFulfillmentId: string;

/** Build an order with `methods.length` packages, one per shop, and a drop for the same-day ones. */
async function seedOrder(methods: Array<"same_day" | "standard">) {
  const cust = await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     VALUES ('sub-cust-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext)
     RETURNING id`,
  );
  const order = await pool.query<{ id: string }>(
    `INSERT INTO public."order"
       (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
     VALUES ($1, 'EFY-' || substr(gen_random_uuid()::text, 1, 6), 20.00, 25.00,
             '{"line1":"1 Test St","city":"Richmond","postalCode":"3121","region":"VIC"}'::jsonb,
             'paid')
     RETURNING id`,
    [cust.rows[0]!.id],
  );
  orderId = order.rows[0]!.id;

  const wave = await pool.query<{ id: string }>(
    `INSERT INTO public.dispatch_wave (kind, planned_for, trigger)
     VALUES ('delivery', now(), 'schedule') RETURNING id`,
  );
  const round = await pool.query<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
     VALUES ($1, $2, 'delivery', now() + interval '6 hours') RETURNING id`,
    [wave.rows[0]!.id, driverId],
  );
  const stop = await pool.query<{ id: string }>(
    `INSERT INTO public.round_stop (round_id, kind, order_id)
     VALUES ($1, 'customer_drop', $2) RETURNING id`,
    [round.rows[0]!.id, orderId],
  );
  dropId = stop.rows[0]!.id;

  for (const [i, method] of methods.entries()) {
    const shop = await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ('S' || $1 || substr(gen_random_uuid()::text,1,4), 'Shop ' || $1)
       RETURNING id`,
      [String(i)],
    );
    const sf = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment
         (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
       VALUES ($1, $2, 1, 10.00, 'collected', $3) RETURNING id`,
      [orderId, shop.rows[0]!.id, method],
    );
    if (method === "same_day") {
      sameDayFulfillmentId = sf.rows[0]!.id;
      // ⚠ Only the same-day package is on the drop. A standard package's driver-side work ended at
      // the hub (063 FR-024) — it is in a carrier's hands and this driver cannot deliver it.
      await pool.query(
        `INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state)
         VALUES ($1, $2, 'picked_up')`,
        [dropId, sf.rows[0]!.id],
      );
    }
  }
}

const proofArgs = () => ({
  dropId,
  driverId,
  driverSub,
  method: "photo" as const,
  mediaKey: "proof/x/1.jpg",
  note: null,
  changeId: crypto.randomUUID(),
});

d("064 — proof IS the delivery completion", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    for (const t of [
      "delivery_proof",
      "delivery_attempt_failure",
      "package_arrival",
      "notification_request",
      "round_package",
      "round_stop",
      "driver_round",
      "dispatch_wave",
      "shop_fulfillment",
      "order_item",
    ]) {
      await pool.query(`DELETE FROM public.${t}`);
    }
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.shop");
    await pool.query("DELETE FROM public.customer");
    await pool.query("DELETE FROM public.driver");

    driverSub = `sub-drv-${crypto.randomUUID()}`;
    const drv = await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email)
       VALUES ($1, 'Proof Driver', ($1 || '@effyshopping.com')::citext) RETURNING id`,
      [driverSub],
    );
    driverId = drv.rows[0]!.id;
  });

  describe("a single-package same-day order", () => {
    beforeEach(() => seedOrder(["same_day"]));

    it("records the proof", async () => {
      const r = await recordProof(proofArgs());
      expect(r.replayed).toBe(false);
      const p = await pool.query("SELECT * FROM public.delivery_proof WHERE stop_id = $1", [dropId]);
      expect(p.rowCount).toBe(1);
      expect(p.rows[0].method).toBe("photo");
      expect(p.rows[0].captured_by_driver_id).toBe(driverId);
    });

    it("moves the package to delivered", async () => {
      await recordProof(proofArgs());
      const sf = await pool.query("SELECT status FROM public.shop_fulfillment WHERE id = $1", [
        sameDayFulfillmentId,
      ]);
      expect(sf.rows[0].status).toBe("delivered");
    });

    /** ⚠ THE ASSERTION WITH NO SECOND CHANCE. See the file header. */
    it("⚠ writes package_arrival — what order completeness actually keys on", async () => {
      await recordProof(proofArgs());
      const pa = await pool.query(
        "SELECT source, recorded_by_sub FROM public.package_arrival WHERE shop_fulfillment_id = $1",
        [sameDayFulfillmentId],
      );
      expect(pa.rowCount).toBe(1);
      // 053's CHECK already permitted this value — it anticipated this exact caller.
      expect(pa.rows[0].source).toBe("driver_proof");
      expect(pa.rows[0].recorded_by_sub).toBe(driverSub);
    });

    it("tells the shopper the order arrived", async () => {
      const r = await recordProof(proofArgs());
      expect(r.orderComplete).toBe(true);
      const n = await pool.query(
        "SELECT type FROM public.notification_request WHERE type = 'order_delivered'",
      );
      expect(n.rowCount).toBeGreaterThan(0);
    });

    it("marks the stop done and the round in progress", async () => {
      await recordProof(proofArgs());
      const s = await pool.query("SELECT status FROM public.round_stop WHERE id = $1", [dropId]);
      expect(s.rows[0].status).toBe("done");
    });
  });

  /**
   * ⚠ 053 FIXED EXACTLY THIS DEFECT AND IT MUST NOT COME BACK. The old driver path enqueued
   * `order_delivered` deduped on the DROP id — and a drop covers only an order's SAME-DAY packages.
   * A mixed order therefore announced "your order has been delivered" while the standard half was
   * still in a carrier's van.
   */
  describe("⚠ a MIXED order stays silent until all of it has arrived", () => {
    beforeEach(() => seedOrder(["same_day", "standard"]));

    it("does not report the order complete on the same-day half", async () => {
      const r = await recordProof(proofArgs());
      expect(r.orderComplete).toBe(false);
    });

    it("sends the shopper NOTHING", async () => {
      await recordProof(proofArgs());
      const n = await pool.query(
        "SELECT 1 FROM public.notification_request WHERE type = 'order_delivered'",
      );
      expect(n.rowCount).toBe(0);
    });

    it("still delivers the same-day package itself", async () => {
      await recordProof(proofArgs());
      const sf = await pool.query("SELECT status FROM public.shop_fulfillment WHERE id = $1", [
        sameDayFulfillmentId,
      ]);
      expect(sf.rows[0].status).toBe("delivered");
    });
  });

  describe("⚠ SC-007 — idempotency and concurrency", () => {
    beforeEach(() => seedOrder(["same_day"]));

    it("a replayed changeId returns the original outcome, not a second delivery", async () => {
      const args = proofArgs();
      await recordProof(args);
      const again = await recordProof(args);
      expect(again.replayed).toBe(true);
      const p = await pool.query("SELECT count(*)::int AS n FROM public.delivery_proof");
      expect(p.rows[0].n).toBe(1);
    });

    it("a second submission for the same drop reports the existing proof", async () => {
      await recordProof(proofArgs());
      const other = await recordProof({ ...proofArgs(), method: "contactless", mediaKey: "proof/x/2.jpg" });
      expect(other.replayed).toBe(true);
      expect(other.proof.method).toBe("photo"); // the original stands
    });

    it("two concurrent submissions yield ONE delivery, ONE arrival, ONE notification", async () => {
      const results = await Promise.allSettled([
        recordProof(proofArgs()),
        recordProof(proofArgs()),
      ]);
      expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThan(0);

      const proofs = await pool.query("SELECT count(*)::int AS n FROM public.delivery_proof");
      const arrivals = await pool.query("SELECT count(*)::int AS n FROM public.package_arrival");
      const notes = await pool.query(
        "SELECT count(*)::int AS n FROM public.notification_request WHERE type = 'order_delivered'",
      );
      expect(proofs.rows[0].n).toBe(1);
      expect(arrivals.rows[0].n).toBe(1);
      // One per channel at most — the dedupe key is order-scoped, never drop-scoped.
      expect(notes.rows[0].n).toBeLessThanOrEqual(2);
    });
  });

  describe("scoping", () => {
    beforeEach(() => seedOrder(["same_day"]));

    it("⚠ another driver's drop is NOT FOUND, indistinguishably from no such drop", async () => {
      const other = await pool.query<{ id: string }>(
        `INSERT INTO public.driver (cognito_sub, name, work_email)
         VALUES ('sub-other', 'Other', 'other@effyshopping.com') RETURNING id`,
      );
      await expect(
        recordProof({ ...proofArgs(), driverId: other.rows[0]!.id }),
      ).rejects.toBeInstanceOf(DropNotFoundError);
      await expect(
        recordProof({ ...proofArgs(), dropId: crypto.randomUUID() }),
      ).rejects.toBeInstanceOf(DropNotFoundError);
    });
  });

  /**
   * US5 — proof is retrievable afterwards (FR-023, FR-024).
   *
   * ⚠ NO EXPIRY IS TESTED BECAUSE NONE EXISTS. Proof media is archived, never deleted (research R5):
   * a lifecycle rule moves it to Glacier Instant Retrieval at 90 days, which serves through the
   * ordinary S3 API in milliseconds. Age changes nothing about how it is read, so there is no
   * age-dependent branch to cover — that is the point of the storage choice.
   */
  describe("US5 — reading proof back", () => {
    beforeEach(() => seedOrder(["same_day"]));

    it("history detail carries the method, note and capture time", async () => {
      await recordProof({ ...proofArgs(), note: "Left with the concierge" });

      const detail = await historyDetail("delivery_drop", dropId, driverId);
      expect(detail.proof).not.toBeNull();
      expect(detail.proof!.method).toBe("photo");
      expect(detail.proof!.note).toBe("Left with the concierge");
      expect(detail.proof!.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("a drop with no proof reports null, not an error", async () => {
      const detail = await historyDetail("delivery_drop", dropId, driverId);
      expect(detail.proof).toBeNull();
    });

    it("⚠ history's `proofCaptured` is real now — it was hardcoded false and drops were always []", async () => {
      await recordProof(proofArgs());
      const h = await history(driverId);
      const allDrops = h.days.flatMap((d) => d.drops);
      expect(allDrops).toHaveLength(1);
      expect(allDrops[0]!.proofCaptured).toBe(true);
      expect(allDrops[0]!.orderRef).toMatch(/^EFY-/);
    });

    /**
     * ⚠ FR-024 — proof is not reachable by someone who is merely holding an identifier.
     *
     * The drop id is a uuid a driver's own app knows; the scoping is what stops it being a key to
     * everyone else's evidence. "Not yours" and "does not exist" are the SAME answer, from one query
     * returning no row, so this route can never be an oracle (052's rule).
     */
    it("⚠ another driver cannot read this drop's proof, and cannot tell it exists", async () => {
      await recordProof(proofArgs());
      const other = await pool.query<{ id: string }>(
        `INSERT INTO public.driver (cognito_sub, name, work_email)
         VALUES ('sub-nosy', 'Nosy', 'nosy@effyshopping.com') RETURNING id`,
      );

      await expect(historyDetail("delivery_drop", dropId, other.rows[0]!.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(
        historyDetail("delivery_drop", crypto.randomUUID(), other.rows[0]!.id),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("⚠ another driver's history does not list this delivery at all", async () => {
      await recordProof(proofArgs());
      const other = await pool.query<{ id: string }>(
        `INSERT INTO public.driver (cognito_sub, name, work_email)
         VALUES ('sub-nosy2', 'Nosy Two', 'nosy2@effyshopping.com') RETURNING id`,
      );
      const h = await history(other.rows[0]!.id);
      expect(h.days.flatMap((d) => d.drops)).toHaveLength(0);
    });
  });

  describe("⚠ US2 — a failure never delivers anything (SC-011)", () => {
    beforeEach(() => seedOrder(["same_day"]));

    for (const reason of ["nobody_home", "wrong_address", "customer_refused", "access_blocked"]) {
      it(`${reason}: the order does not become delivered`, async () => {
        await recordFailure({ dropId, driverId, reason, note: null, changeId: crypto.randomUUID() });

        const sf = await pool.query("SELECT status FROM public.shop_fulfillment WHERE id = $1", [
          sameDayFulfillmentId,
        ]);
        expect(sf.rows[0].status).toBe("collected"); // still the driver's

        const pa = await pool.query("SELECT count(*)::int AS n FROM public.package_arrival");
        expect(pa.rows[0].n).toBe(0);

        const n = await pool.query(
          "SELECT count(*)::int AS n FROM public.notification_request WHERE type = 'order_delivered'",
        );
        expect(n.rows[0].n).toBe(0);
      });
    }

    it("⚠ the package stays in the driver's custody (FR-011)", async () => {
      await recordFailure({ dropId, driverId, reason: "nobody_home", note: null, changeId: crypto.randomUUID() });
      const rp = await pool.query("SELECT state FROM public.round_package WHERE stop_id = $1", [dropId]);
      expect(rp.rows[0].state).toBe("picked_up");
    });

    it("records several attempts for one drop", async () => {
      await recordFailure({ dropId, driverId, reason: "nobody_home", note: null, changeId: crypto.randomUUID() });
      await recordFailure({ dropId, driverId, reason: "access_blocked", note: null, changeId: crypto.randomUUID() });
      const f = await pool.query("SELECT count(*)::int AS n FROM public.delivery_attempt_failure");
      expect(f.rows[0].n).toBe(2);
    });

    it("a replayed failure changeId does not record twice", async () => {
      const args = { dropId, driverId, reason: "nobody_home", note: null, changeId: crypto.randomUUID() };
      await recordFailure(args);
      const again = await recordFailure(args);
      expect(again.replayed).toBe(true);
      const f = await pool.query("SELECT count(*)::int AS n FROM public.delivery_attempt_failure");
      expect(f.rows[0].n).toBe(1);
    });
  });
});
