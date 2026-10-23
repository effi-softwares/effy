import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The order reads against real Postgres. The history is a union over tables different features own,
 * and every arrival must be attributable by `package_arrival.source`.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

// The real library with only its database entry points redirected; `stageFor` comes from it.
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}));

import { migrationSql } from "@effy/edge-shared/testing";
import { history, list, packages, viewCounts } from "./repository";
import { listOrders } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("order reads — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE public.package_arrival, public.carrier_handoff, public.fulfillment_event,
               public.order_package_delivery, public.order_item,
               public.shop_fulfillment, public.payment, public."order", public.customer,
               public.shop RESTART IDENTITY CASCADE`);
  });

  async function seed(type: "effy" | "courier" = "courier") {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email, given_name, family_name)
       VALUES (gen_random_uuid()::text, substr(md5(random()::text), 1, 8) || '@example.com', 'Ada', 'Lovelace') RETURNING id`,
    );
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, placed_at, delivery_address, item_subtotal_amount,
                                   grand_total_amount, delivery_type, delivery_type_reason, delivery_promise, courier_estimate)
       VALUES ($1, 'EFY-' || substr(md5(random()::text), 1, 6), 'paid', now(), '{}', 10, 10, $2::text,
               CASE WHEN $2::text = 'effy' THEN 'in_coverage' ELSE 'out_of_coverage' END,
               CASE WHEN $2::text = 'effy' THEN 'day' END,
               CASE WHEN $2::text = 'courier' THEN '2–4 business days' END) RETURNING id`,
      [c.rows[0]!.id, type],
    );
    const s = await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES (substr(md5(random()::text), 1, 6), 'Shop One') RETURNING id`,
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount)
       VALUES ($1, $2, 'collected', 1, 10) RETURNING id`,
      [o.rows[0]!.id, s.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method) VALUES ($1, $2, 'standard')`,
      [o.rows[0]!.id, s.rows[0]!.id],
    );
    return { orderId: o.rows[0]!.id, fulfillmentId: f.rows[0]!.id };
  }

  it("returns history from every remaining source, in time order", async () => {
    const { orderId, fulfillmentId } = await seed();

    await pool.query(
      `INSERT INTO public.fulfillment_event (shop_fulfillment_id, event_type, to_status, occurred_at)
       VALUES ($1, 'state_changed', 'picking', now() - interval '4 hours')`,
      [fulfillmentId],
    );
    await pool.query(
      `INSERT INTO public.carrier_handoff (shop_fulfillment_id, carrier_name, recorded_by_sub, handed_over_at)
       VALUES ($1, 'Australia Post', 'staff-1', now() - interval '2 hours')`,
      [fulfillmentId],
    );
    await pool.query(
      `INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub, arrived_at)
       VALUES ($1, 'staff_recorded', 'staff-1', now() - interval '1 hour')`,
      [fulfillmentId],
    );

    const rows = await history(orderId);

    expect(rows.map((r) => r.kind)).toEqual(["fulfillment", "handoff", "arrival"]);
    expect(rows.map((r) => r.at.getTime())).toEqual([...rows.map((r) => r.at.getTime())].sort((a, b) => a - b));
    expect(rows[1]!.summary).toBe("Handed to Australia Post");
    expect(rows[2]!.actor_sub).toBe("staff-1");
  });

  /** The history entry reads the same with or without a consignment number. */
  it("summarises a handover with no carrier the same way, with no hint of missing data", async () => {
    const { orderId, fulfillmentId } = await seed();
    await pool.query(
      `INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 'staff-1')`,
      [fulfillmentId],
    );

    const rows = await history(orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toBe("Handed to carrier");
    for (const hint of ["null", "undefined", "—", "unknown", "missing", "n/a"]) {
      expect(rows[0]!.summary.toLowerCase()).not.toContain(hint);
    }
  });

  /** Every arrival is attributable, whichever route it came by. */
  it("distinguishes a driver arrival from a back-office one", async () => {
    const a = await seed("effy");
    await pool.query(
      `INSERT INTO public.package_arrival (shop_fulfillment_id, source)
       VALUES ($1, 'driver_proof')`,
      [a.fulfillmentId],
    );

    const b = await seed("courier");
    await pool.query(
      `INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub)
       VALUES ($1, 'staff_recorded', 'staff-9')`,
      [b.fulfillmentId],
    );

    const [driverPkg] = await packages(a.orderId);
    const [staffPkg] = await packages(b.orderId);

    expect(driverPkg!.arrival_source).toBe("driver_proof");
    expect(staffPkg!.arrival_source).toBe("staff_recorded");
    expect(staffPkg!.arrival_by).toBe("staff-9");
  });

  describe("the list's `awaiting` filter", () => {
    it("finds a collected courier package with no handover", async () => {
      await seed("courier");
      const rows = await list({ awaiting: "handover", limit: 10 });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.awaiting_handover).toBe(1);
    });

    it("does NOT list an Effy package as awaiting handover: Effy delivers it", async () => {
      await seed("effy");
      expect(await list({ awaiting: "handover", limit: 10 })).toHaveLength(0);
      const [row] = await list({ limit: 10 });
      expect(row!.awaiting_handover).toBe(0);
    });

    it("moves an order from `handover` to `arrival` once handed over", async () => {
      const { fulfillmentId } = await seed("courier");
      await pool.query(
        `INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 's')`,
        [fulfillmentId],
      );

      expect(await list({ awaiting: "handover", limit: 10 })).toHaveLength(0);
      expect(await list({ awaiting: "arrival", limit: 10 })).toHaveLength(1);
    });

    it("drops a fully arrived order out of both queues", async () => {
      const { fulfillmentId } = await seed("courier");
      await pool.query(
        `INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 's')`,
        [fulfillmentId],
      );
      await pool.query(
        `INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub)
         VALUES ($1, 'staff_recorded', 's')`,
        [fulfillmentId],
      );

      expect(await list({ awaiting: "handover", limit: 10 })).toHaveLength(0);
      expect(await list({ awaiting: "arrival", limit: 10 })).toHaveLength(0);
      const all = await list({ limit: 10 });
      expect(all[0]!.awaiting_arrival).toBe(0);
    });

    // Each view's count is exactly the rows its view lists.
    it("counts every view with the list's own filters", async () => {
      const { fulfillmentId } = await seed("courier");
      await seed("courier");
      await pool.query(
        `INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 's')`,
        [fulfillmentId],
      );
      const counts = await viewCounts({});
      expect(Number(counts.total)).toBe((await list({ limit: 50 })).length);
      expect(Number(counts.handover)).toBe((await list({ awaiting: "handover", limit: 50 })).length);
      expect(Number(counts.arrival)).toBe((await list({ awaiting: "arrival", limit: 50 })).length);
      expect(Number(counts.needs_driver)).toBe((await list({ needsDriver: true, limit: 50 })).length);
      expect(Number(counts.refund_decision)).toBe((await list({ awaiting: "refund_decision", limit: 50 })).length);
      expect(Number(counts.courier_problem)).toBe((await list({ awaiting: "courier_problem", limit: 50 })).length);
      expect(Number(counts.handover)).toBe(1);
    });
  });

  /**
   * The cursor must come from `created_at`, the column the list orders by: `placed_at` is always later,
   * so page 2 repeated rows. The two are seeded apart, as in production.
   */
  describe("keyset pagination", () => {
    async function seedAged(n: number) {
      const c = await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email) VALUES ('pager', 'pager@example.com') RETURNING id`,
      );
      for (let i = 0; i < n; i++) {
        await pool.query(
          `INSERT INTO public."order" (customer_id, order_number, status, created_at, placed_at, delivery_address,
                                       item_subtotal_amount, grand_total_amount, delivery_type, delivery_type_reason, delivery_promise)
           VALUES ($1, $2, 'paid',
                   now() - ($3 || ' hours')::interval,
                   -- ⚠ placed_at is LATER than created_at, as it always is in production.
                   now() - ($3 || ' hours')::interval + interval '20 minutes', '{}', 10, 10, 'effy', 'in_coverage', 'day')`,
          [c.rows[0]!.id, `EFY-P${i}`, String(n - i)],
        );
      }
    }

    /** Through `listOrders`, where the cursor is minted; a test that builds its own cursor cannot catch this. */
    it("pages without repeating or skipping an order", async () => {
      await seedAged(6);

      const page1 = await listOrders({ limit: 3 });
      expect(page1.items).toHaveLength(3);
      expect(page1.nextCursor, "there is a second page, so a cursor must be offered").not.toBeNull();

      const page2 = await listOrders({ cursor: page1.nextCursor!, limit: 3 });

      const first = page1.items.map((r) => r.orderNumber);
      const second = page2.items.map((r) => r.orderNumber);

      expect(second).toHaveLength(3);
      expect(
        second.filter((n) => first.includes(n)),
        "page 2 repeated an order from page 1 — the minted cursor and the ORDER BY column disagree",
      ).toEqual([]);
      expect(new Set([...first, ...second]).size).toBe(6);
    });

    it("stops offering a cursor on the last page", async () => {
      await seedAged(4);
      const page = await listOrders({ limit: 4 });
      expect(page.items).toHaveLength(4);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe("search", () => {
    it("finds an order by its reference and by customer email", async () => {
      await seed();
      expect(await list({ q: (await pool.query(`SELECT order_number FROM public."order"`)).rows[0].order_number, limit: 10 })).toHaveLength(1);
      expect(await list({ q: (await pool.query(`SELECT email FROM public.customer`)).rows[0].email, limit: 10 })).toHaveLength(1);
      expect(await list({ q: "nothing-like-this", limit: 10 })).toHaveLength(0);
    });

    it("never lists an order that was never paid for", async () => {
      // A checkout abandoned before payment is not an order.
      const c = await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email) VALUES ('x', 'x@example.com') RETURNING id`,
      );
      await pool.query(
        `INSERT INTO public."order" (customer_id, order_number, status, delivery_address, item_subtotal_amount, grand_total_amount)
         VALUES ($1, 'EFY-PEND', 'pending_payment', '{}', 10, 10)`,
        [c.rows[0]!.id],
      );
      expect(await list({ limit: 10 })).toHaveLength(0);
    });
  });
});
