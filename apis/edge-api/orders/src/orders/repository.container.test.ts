import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The order READS, against real PostgreSQL 16 (053 US1).
 *
 * ⚠ THE HISTORY IS A FOUR-WAY UNION ACROSS TABLES THREE DIFFERENT SLICES OWN — `fulfillment_event`
 * (020), `driver_task_event` (049), `carrier_handoff` and `package_arrival` (053). A mock cannot
 * catch a wrong column, a join that quietly excludes a row, or an ordering that only looks right on
 * one source's data. The closure repo's own container test exists for exactly this reason and this
 * query is larger.
 *
 * ⚠ IT ALSO PROVES SC-010 (attribution). A same-day arrival and a back-office arrival must BOTH
 * produce a `package_arrival` row, with DIFFERENT `source` values. If the driver-path extension in
 * research R6 is ever reverted, the same-day half of that vanishes and this fails.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}));

import { history, list, packages } from "./repository";
import { listOrders } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("order reads — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;

    await pool.query(`
      CREATE TABLE public.customer (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL, given_name text, family_name text
      );
      CREATE TABLE public."order" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL REFERENCES public.customer (id),
        order_number text NOT NULL, status text NOT NULL,
        item_subtotal_amount numeric(12,2) NOT NULL DEFAULT 0,
        delivery_fee_amount numeric(12,2) NOT NULL DEFAULT 0,
        discount_amount numeric(12,2) NOT NULL DEFAULT 0,
        grand_total_amount numeric(12,2) NOT NULL DEFAULT 0,
        currency char(3) NOT NULL DEFAULT 'AUD',
        delivery_address jsonb NOT NULL DEFAULT '{}'::jsonb,
        billing_address jsonb,
        promo_code_id uuid,
        placed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.promo_code (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL);
      CREATE TABLE public.payment (
        order_id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'succeeded',
        method_type text, method_brand text, method_last4 text
      );
      CREATE TABLE public.shop (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
      CREATE TABLE public.shop_fulfillment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
        shop_id uuid NOT NULL REFERENCES public.shop (id),
        status text NOT NULL, item_count int NOT NULL DEFAULT 1,
        subtotal_amount numeric(12,2) NOT NULL DEFAULT 0
      );
      CREATE TABLE public.order_item (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL, product_id uuid NOT NULL DEFAULT gen_random_uuid(),
        shop_id uuid NOT NULL, product_name text NOT NULL,
        unit_price_amount numeric(12,2) NOT NULL DEFAULT 0, quantity int NOT NULL DEFAULT 1,
        line_subtotal_amount numeric(12,2) NOT NULL DEFAULT 0
      );
      CREATE TABLE public.order_package_delivery (
        order_id uuid NOT NULL, shop_id uuid NOT NULL, method text NOT NULL
      );
      CREATE TABLE public.driver_run (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.collection_task (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_fulfillment_id uuid NOT NULL
      );
      CREATE TABLE public.delivery_task (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.delivery_task_package (
        delivery_task_id uuid NOT NULL, shop_fulfillment_id uuid NOT NULL
      );
      CREATE TABLE public.driver_task_event (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid, collection_task_id uuid, delivery_task_id uuid,
        status text NOT NULL, at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.fulfillment_event (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
        event_type text NOT NULL, from_status text, to_status text,
        occurred_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.carrier_handoff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_fulfillment_id uuid NOT NULL UNIQUE,
        reference text, carrier_name text,
        handed_over_at timestamptz NOT NULL DEFAULT now(),
        recorded_by_sub text NOT NULL, note text
      );
      CREATE TABLE public.package_arrival (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_fulfillment_id uuid NOT NULL UNIQUE,
        arrived_at timestamptz NOT NULL DEFAULT now(),
        source text NOT NULL, recorded_by_sub text, delivery_task_id uuid, note text
      );
    `);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE public.package_arrival, public.carrier_handoff, public.fulfillment_event,
               public.driver_task_event, public.delivery_task_package, public.collection_task,
               public.delivery_task, public.order_package_delivery, public.order_item,
               public.shop_fulfillment, public.payment, public."order", public.customer,
               public.shop, public.promo_code RESTART IDENTITY CASCADE`);
  });

  async function seed(method: "standard" | "same_day" = "standard") {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (email, given_name, family_name)
       VALUES ('shopper@example.com', 'Ada', 'Lovelace') RETURNING id`,
    );
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, placed_at)
       VALUES ($1, 'EFY-TEST01', 'paid', now()) RETURNING id`,
      [c.rows[0]!.id],
    );
    const s = await pool.query<{ id: string }>(
      `INSERT INTO public.shop (name) VALUES ('Shop One') RETURNING id`,
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status)
       VALUES ($1, $2, 'collected') RETURNING id`,
      [o.rows[0]!.id, s.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method) VALUES ($1, $2, $3)`,
      [o.rows[0]!.id, s.rows[0]!.id, method],
    );
    await pool.query(`INSERT INTO public.payment (order_id) VALUES ($1)`, [o.rows[0]!.id]);
    return { orderId: o.rows[0]!.id, fulfillmentId: f.rows[0]!.id };
  }

  it("returns history from ALL FOUR sources, in time order", async () => {
    const { orderId, fulfillmentId } = await seed();

    await pool.query(
      `INSERT INTO public.fulfillment_event (shop_fulfillment_id, event_type, to_status, occurred_at)
       VALUES ($1, 'state_changed', 'picking', now() - interval '4 hours')`,
      [fulfillmentId],
    );
    const ct = await pool.query<{ id: string }>(
      `INSERT INTO public.collection_task (shop_fulfillment_id) VALUES ($1) RETURNING id`,
      [fulfillmentId],
    );
    await pool.query(
      `INSERT INTO public.driver_task_event (collection_task_id, status, at)
       VALUES ($1, 'collected', now() - interval '3 hours')`,
      [ct.rows[0]!.id],
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

    expect(rows.map((r) => r.kind)).toEqual(["fulfillment", "driver", "handoff", "arrival"]);
    expect(rows.map((r) => r.at.getTime())).toEqual([...rows.map((r) => r.at.getTime())].sort((a, b) => a - b));
    expect(rows[2]!.summary).toBe("Handed to Australia Post");
    expect(rows[3]!.actor_sub).toBe("staff-1");
  });

  /** ⚠ FR-003. The history entry must read the same with or without a consignment number. */
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

  /**
   * ⚠ SC-010 — every arrival attributable, whichever route it came by. If research R6's driver-path
   * extension is reverted, the `driver_proof` half disappears and this fails.
   */
  it("distinguishes a driver arrival from a back-office one", async () => {
    const a = await seed("same_day");
    const dt = await pool.query<{ id: string }>(
      `INSERT INTO public.delivery_task DEFAULT VALUES RETURNING id`,
    );
    await pool.query(
      `INSERT INTO public.package_arrival (shop_fulfillment_id, source, delivery_task_id)
       VALUES ($1, 'driver_proof', $2)`,
      [a.fulfillmentId, dt.rows[0]!.id],
    );

    const b = await seed("standard");
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
    it("finds a collected standard package with no handover", async () => {
      await seed("standard");
      const rows = await list({ awaiting: "handover", limit: 10 });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.awaiting_handover).toBe(1);
    });

    it("does NOT list a same-day package as awaiting handover", async () => {
      // A same-day package is delivered by an Effy driver and never passes to a carrier — listing it
      // in the handover queue would send an operator looking for a carrier that was never involved.
      await seed("same_day");
      expect(await list({ awaiting: "handover", limit: 10 })).toHaveLength(0);
    });

    it("moves an order from `handover` to `arrival` once handed over", async () => {
      const { fulfillmentId } = await seed("standard");
      await pool.query(
        `INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 's')`,
        [fulfillmentId],
      );

      expect(await list({ awaiting: "handover", limit: 10 })).toHaveLength(0);
      expect(await list({ awaiting: "arrival", limit: 10 })).toHaveLength(1);
    });

    it("drops a fully arrived order out of both queues", async () => {
      const { fulfillmentId } = await seed("standard");
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
  });

  /**
   * ⚠ THE DEFECT THIS CATCHES, found by reading the code back rather than by any gate.
   *
   * The list ORDERS and FILTERS on `created_at`, but an earlier draft minted the cursor from
   * `placed_at`. Those are different instants — `created_at` is when the pending order row was
   * written, `placed_at` is when the payment webhook confirmed it — and `placed_at` is ALWAYS the
   * later one. So `created_at < <a placed_at>` still matched rows that had already been shown, and
   * page 2 repeated part of page 1.
   *
   * ⚠ It is invisible to a single-page test, and to any test where the two timestamps are seeded
   * equal. This one seeds them deliberately APART — which is what production does, by however long
   * the payment took.
   */
  describe("keyset pagination", () => {
    async function seedAged(n: number) {
      const c = await pool.query<{ id: string }>(
        `INSERT INTO public.customer (email) VALUES ('pager@example.com') RETURNING id`,
      );
      for (let i = 0; i < n; i++) {
        await pool.query(
          `INSERT INTO public."order" (customer_id, order_number, status, created_at, placed_at)
           VALUES ($1, $2, 'paid',
                   now() - ($3 || ' hours')::interval,
                   -- ⚠ placed_at is LATER than created_at, as it always is in production.
                   now() - ($3 || ' hours')::interval + interval '20 minutes')`,
          [c.rows[0]!.id, `EFY-P${i}`, String(n - i)],
        );
      }
    }

    /**
     * ⚠ GOES THROUGH `listOrders`, NOT `list`, AND THAT IS THE WHOLE POINT.
     *
     * A first version of this test called the repository directly and computed the cursor itself —
     * so it passed with the defect still in place, because the broken line lives in the SERVICE,
     * where the cursor is MINTED. A test that supplies its own correct cursor can never catch a
     * wrong one. Proven by reverting: restore `placed_at` in `listOrders` and this fails.
     */
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
      expect(await list({ q: "EFY-TEST", limit: 10 })).toHaveLength(1);
      expect(await list({ q: "shopper@", limit: 10 })).toHaveLength(1);
      expect(await list({ q: "nothing-like-this", limit: 10 })).toHaveLength(0);
    });

    it("never lists an order that was never paid for", async () => {
      // A checkout abandoned before payment is not an order awaiting anything, and must not appear
      // in an operator's queue as though it were.
      const c = await pool.query<{ id: string }>(
        `INSERT INTO public.customer (email) VALUES ('x@example.com') RETURNING id`,
      );
      await pool.query(
        `INSERT INTO public."order" (customer_id, order_number, status)
         VALUES ($1, 'EFY-PEND', 'pending_payment')`,
        [c.rows[0]!.id],
      );
      expect(await list({ limit: 10 })).toHaveLength(0);
    });
  });
});
