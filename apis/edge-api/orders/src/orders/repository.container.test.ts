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
import { parseListQuery } from "@effy/edge-shared";
import { ORDER_LIST_SPEC } from "../orders/list";

/** A list request as the route parses it (103). */
const req = (qs: Record<string, string | undefined>) => parseListQuery({ pageSize: "100", ...qs }, ORDER_LIST_SPEC);
import { activityEntries } from "@effy/edge-shared/testing";

import { orderActivitySource } from "../activity/order";
import { list, milestones, packages, paidOrderCount, viewCounts } from "./repository";
import { listOrders, toMilestones } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("order reads - against real PostgreSQL", () => {
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

    const rows = (await activityEntries(pool, orderActivitySource(orderId))).reverse();

    expect(rows.map((r) => r.kind)).toEqual(["packing", "courier", "delivery"]);
    expect(rows.map((r) => Date.parse(r.at))).toEqual([...rows.map((r) => Date.parse(r.at))].sort((a, b) => a - b));
    expect(rows[1]!.title).toBe("Handed to Australia Post");
    // A sign-in subject is never shown: a staff record that is gone is said as such.
    expect(rows[2]!.actor).toBe("Former staff");
  });

  /** The journey's times come from the records that already say so; a reopened package keeps its latest "ready". */
  it("reads each step a package has reached, with its time", async () => {
    const { fulfillmentId } = await seed();
    await pool.query(
      `INSERT INTO public.fulfillment_event (shop_fulfillment_id, event_type, to_status, occurred_at) VALUES
         ($1, 'state_changed', 'ready_for_pickup', now() - interval '5 hours'),
         ($1, 'state_changed', 'picking', now() - interval '4 hours 30 minutes'),
         ($1, 'state_changed', 'ready_for_pickup', now() - interval '4 hours')`,
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

    const [row] = await milestones([fulfillmentId]);
    const steps = toMilestones(row);
    expect(steps.map((m) => m.status)).toEqual(["preparing", "ready", "with_carrier", "delivered"]);
    const at = Object.fromEntries(steps.map((m) => [m.status, Date.parse(m.at)]));
    expect(Date.now() - at.ready!).toBeGreaterThan(3.9 * 3_600_000);
    expect(Date.now() - at.ready!).toBeLessThan(4.1 * 3_600_000);
    expect(await milestones([])).toEqual([]);
  });

  it("counts only the customer's paid orders", async () => {
    const { orderId } = await seed();
    const c = await pool.query<{ customer_id: string }>(`SELECT customer_id FROM public."order" WHERE id = $1`, [orderId]);
    await pool.query(
      `INSERT INTO public."order" (customer_id, order_number, status, delivery_address, item_subtotal_amount, grand_total_amount)
       VALUES ($1, 'EFY-UNPAID', 'pending_payment', '{}', 1, 1)`,
      [c.rows[0]!.customer_id],
    );
    expect(await paidOrderCount(c.rows[0]!.customer_id)).toBe(1);
  });

  /** The history entry reads the same with or without a consignment number. */
  it("summarises a handover with no carrier the same way, with no hint of missing data", async () => {
    const { orderId, fulfillmentId } = await seed();
    await pool.query(
      `INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 'staff-1')`,
      [fulfillmentId],
    );

    const rows = await activityEntries(pool, orderActivitySource(orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Handed to carrier");
    expect(rows[0]!.detail).toBeNull();
    for (const hint of ["null", "undefined", "-", "unknown", "missing", "n/a"]) {
      expect(rows[0]!.title.toLowerCase()).not.toContain(hint);
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
      const rows = await list(req({ view: "handover" }));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.awaiting_handover).toBe(1);
    });

    it("does NOT list an Effy package as awaiting handover: Effy delivers it", async () => {
      await seed("effy");
      expect(await list(req({ view: "handover" }))).toHaveLength(0);
      const [row] = await list(req({}));
      expect(row!.awaiting_handover).toBe(0);
    });

    it("moves an order from `handover` to `arrival` once handed over", async () => {
      const { fulfillmentId } = await seed("courier");
      await pool.query(
        `INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 's')`,
        [fulfillmentId],
      );

      expect(await list(req({ view: "handover" }))).toHaveLength(0);
      expect(await list(req({ view: "arrival" }))).toHaveLength(1);
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

      expect(await list(req({ view: "handover" }))).toHaveLength(0);
      expect(await list(req({ view: "arrival" }))).toHaveLength(0);
      const all = await list(req({}));
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
      expect(Number(counts.total)).toBe((await list(req({}))).length);
      expect(Number(counts.handover)).toBe((await list(req({ view: "handover" }))).length);
      expect(Number(counts.arrival)).toBe((await list(req({ view: "arrival" }))).length);
      expect(Number(counts.needs_driver)).toBe((await list(req({ view: "driver" }))).length);
      expect(Number(counts.refund_decision)).toBe((await list(req({ view: "refund" }))).length);
      expect(Number(counts.courier_problem)).toBe((await list(req({ view: "courier" }))).length);
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
      await seedAged(30);

      const page1 = await listOrders(req({ pageSize: "25" }));
      expect(page1.items).toHaveLength(25);
      expect(page1).toMatchObject({ total: 30, totalCapped: false, page: null });
      expect(page1.nextCursor, "there is a second page, so a cursor must be offered").not.toBeNull();

      const page2 = await listOrders(req({ pageSize: "25", cursor: page1.nextCursor! }));

      const first = page1.items.map((r) => r.orderNumber);
      const second = page2.items.map((r) => r.orderNumber);

      expect(second).toHaveLength(5);
      expect(
        second.filter((n) => first.includes(n)),
        "page 2 repeated an order from page 1 - the minted cursor and the ORDER BY column disagree",
      ).toEqual([]);
      expect(new Set([...first, ...second]).size).toBe(30);
      expect(page2.nextCursor).toBeNull();
    });

    it("⚠ 103 - two orders written in the same instant on either side of a page edge are both listed", async () => {
      const c = await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('tie', 'tie@example.com') RETURNING id`);
      // 30 orders sharing ONE created_at: the old `created_at < cursor` skipped every one after page 1.
      for (let i = 0; i < 30; i++) {
        await pool.query(
          `INSERT INTO public."order" (customer_id, order_number, status, created_at, placed_at, delivery_address,
                                       item_subtotal_amount, grand_total_amount, delivery_type, delivery_type_reason, delivery_promise)
           VALUES ($1, $2, 'paid', '2026-10-01T10:00:00.123456Z', '2026-10-01T10:05:00Z', '{}', 10, 10, 'effy', 'in_coverage', 'day')`,
          [c.rows[0]!.id, `EFY-T${i}`],
        );
      }
      const p1 = await listOrders(req({ pageSize: "25" }));
      const p2 = await listOrders(req({ pageSize: "25", cursor: p1.nextCursor! }));
      const all = [...p1.items, ...p2.items].map((o) => o.orderNumber);
      expect(all).toHaveLength(30);
      expect(new Set(all).size).toBe(30);
    });

    it("⚠ 103 - orders arriving while paging push nothing off and repeat nothing", async () => {
      await seedAged(30);
      const p1 = await listOrders(req({ pageSize: "25" }));
      // New orders arrive at the top between the two reads.
      const c = await pool.query<{ id: string }>(`SELECT id FROM public.customer LIMIT 1`);
      for (let i = 0; i < 5; i++) {
        await pool.query(
          `INSERT INTO public."order" (customer_id, order_number, status, delivery_address, item_subtotal_amount, grand_total_amount, delivery_type, delivery_type_reason, delivery_promise)
           VALUES ($1, $2, 'paid', '{}', 10, 10, 'effy', 'in_coverage', 'day')`,
          [c.rows[0]!.id, `EFY-NEW${i}`],
        );
      }
      const p2 = await listOrders(req({ pageSize: "25", cursor: p1.nextCursor! }));
      const seen = [...p1.items, ...p2.items].map((o) => o.orderNumber);
      expect(seen).toHaveLength(30);
      expect(new Set(seen).size).toBe(30);
      expect(seen.some((n) => n.startsWith("EFY-NEW"))).toBe(false);
    });

    it("sorts by total, still a total order", async () => {
      await seedAged(30);
      const p1 = await listOrders(req({ pageSize: "25", sort: "total" }));
      const p2 = await listOrders(req({ pageSize: "25", sort: "total", cursor: p1.nextCursor! }));
      expect(new Set([...p1.items, ...p2.items].map((o) => o.id)).size).toBe(30);
    });

    it("stops offering a cursor on the last page", async () => {
      await seedAged(4);
      const page = await listOrders(req({ pageSize: "25" }));
      expect(page.items).toHaveLength(4);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe("filters added in 103", () => {
    it("narrows to one shop's orders and to a placed-day range (operating time zone)", async () => {
      const a = await seed("courier");
      await seed("effy");
      const shop = (await pool.query<{ shop_id: string }>(`SELECT shop_id FROM public.shop_fulfillment WHERE id = $1`, [a.fulfillmentId])).rows[0]!.shop_id;
      const mine = await listOrders(req({ shopId: shop }));
      expect(mine.items.length).toBeGreaterThan(0);
      expect(mine.total).toBe(mine.items.length);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
      expect((await listOrders(req({ placedFrom: today, placedTo: today }))).total).toBeGreaterThan(0);
      expect((await listOrders(req({ placedTo: "2000-01-01" }))).total).toBe(0);
    });
  });

  describe("search", () => {
    it("finds an order by its reference and by customer email", async () => {
      await seed();
      expect(await list(req({ q: (await pool.query(`SELECT order_number FROM public."order"`)).rows[0].order_number }))).toHaveLength(1);
      expect(await list(req({ q: (await pool.query(`SELECT email FROM public.customer`)).rows[0].email }))).toHaveLength(1);
      expect(await list(req({ q: "nothing-like-this" }))).toHaveLength(0);
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
      expect(await list(req({}))).toHaveLength(0);
    });
  });
});
