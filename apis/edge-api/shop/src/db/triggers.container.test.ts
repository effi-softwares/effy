import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The triggers against real Postgres: the dirty mark lands in the same transaction as the change
 * (proven by rolling back).
 */

const RUN = process.env.CONTAINER_TESTS === "1";

const CUST = "11111111-1111-4111-8111-111111111111";
const SHOP = "33333333-3333-4333-8333-333333333333";

describe.skipIf(!RUN)("shop_ops triggers — real PostgreSQL, real migrations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE public.customer, public.shop, public.product_type, public.category RESTART IDENTITY CASCADE`,
    );
    await pool.query(`INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-c','a@b.c')`, [CUST]);
    await pool.query(`INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One')`, [SHOP]);
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('grocery','Grocery')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('dairy','Dairy')`);
    await pool.query(`DELETE FROM public.insights_dirty`);
  });

  /** Building an order marks the bucket dirty itself, so each test starts from a clean queue. */
  async function forgetFixtureWork(): Promise<void> {
    await pool.query(`DELETE FROM public.insights_dirty`);
  }

  async function paidOrder(number: string): Promise<{ orderId: string; fulfillmentId: string }> {
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
         delivery_fee_amount, grand_total_amount, delivery_address, placed_at, delivery_type, delivery_type_reason)
       VALUES ($1,$2,'pending_payment',30,0,30,'{"recipientName":"Ada"}'::jsonb, now(), 'effy', 'in_coverage') RETURNING id`,
      [CUST, number],
    );
    const orderId = o.rows[0]!.id;
    const p = await pool.query<{ id: string }>(
      `WITH p AS (INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, short_description, created_by, status, approved_at) SELECT $1, pt.id, c.id, 'Milk', 'x', 'seed', 'active', now() FROM public.product_type pt, public.category c RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(10, 10)::numeric, (10)::numeric FROM p RETURNING id)
SELECT id FROM p`,
      [SHOP],
    );
    await pool.query(
      `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, shop_unit_price_amount, shop_line_subtotal_amount)
       VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, 'Milk', 10, 3, 30, 10, 30)`,
      [orderId, p.rows[0]!.id, SHOP],
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount)
       VALUES ($1,$2,3,30) RETURNING id`,
      [orderId, SHOP],
    );
    return { orderId, fulfillmentId: f.rows[0]!.id };
  }

  it("a committed refund marks exactly one bucket", async () => {
    const { orderId } = await paidOrder("EFY-T1");
    await forgetFixtureWork();
    await pool.query(
      `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind, actor_sub)
       VALUES ($1,'item',10,'item_not_supplied','k-1','back_office','sub-staff')`,
      [orderId],
    );

    const dirty = await pool.query(`SELECT shop_id, bucket_start FROM public.insights_dirty`);
    expect(dirty.rowCount).toBe(1);
    expect(dirty.rows[0]!.shop_id).toBe(SHOP);
  });

  it("⚠ a ROLLED-BACK refund leaves no dirty mark", async () => {
    const { orderId } = await paidOrder("EFY-T2");
    await forgetFixtureWork();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind, actor_sub)
         VALUES ($1,'item',10,'item_not_supplied','k-2','back_office','sub-staff')`,
        [orderId],
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const dirty = await pool.query(`SELECT 1 FROM public.insights_dirty`);
    expect(dirty.rowCount, "a rolled-back change must leave no work behind").toBe(0);
  });

  it("pick progress — the busiest write a shop makes — marks nothing", async () => {
    const { fulfillmentId, orderId } = await paidOrder("EFY-T3");
    const item = await pool.query<{ id: string }>(
      `SELECT id FROM public.order_item WHERE order_id = $1`,
      [orderId],
    );
    await forgetFixtureWork();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 1; i <= 5; i++) {
        await client.query(
          `INSERT INTO public.fulfillment_item (shop_fulfillment_id, order_item_id, ordered_quantity,
             gathered_quantity)
           VALUES ($1,$2,3,$3)
           ON CONFLICT (shop_fulfillment_id, order_item_id) DO UPDATE SET gathered_quantity = EXCLUDED.gathered_quantity`,
          // `fulfillment_item_accounted_ck` refuses more gathered than ordered, so picks cycle 1,2,3,1,2.
          [fulfillmentId, item.rows[0]!.id, ((i - 1) % 3) + 1],
        );
      }
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    expect((await pool.query(`SELECT 1 FROM public.insights_dirty`)).rowCount).toBe(0);
  });

  it("the first mark's marked_at survives later marks, so backlog age is the real lag", async () => {
    const { orderId } = await paidOrder("EFY-T4");
    await forgetFixtureWork();
    await pool.query(
      `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind, actor_sub)
       VALUES ($1,'item',10,'item_not_supplied','k-4','back_office','sub-staff')`,
      [orderId],
    );
    const first = await pool.query<{ marked_at: Date }>(`SELECT marked_at FROM public.insights_dirty`);
    await pool.query(`UPDATE public.refund SET status = 'submitted' WHERE order_id = $1`, [orderId]);
    const again = await pool.query<{ marked_at: Date }>(`SELECT marked_at FROM public.insights_dirty`);

    expect(again.rowCount).toBe(1);
    expect(again.rows[0]!.marked_at.getTime()).toBe(first.rows[0]!.marked_at.getTime());
  });

  it("an order becoming paid marks the hour it was PLACED, in the shop's timezone", async () => {
    const { orderId } = await paidOrder("EFY-T5");
    await forgetFixtureWork();
    await pool.query(`UPDATE public."order" SET status = 'paid' WHERE id = $1`, [orderId]);

    const dirty = await pool.query<{ bucket_start: Date }>(
      `SELECT bucket_start FROM public.insights_dirty WHERE shop_id = $1`,
      [SHOP],
    );
    const expected = await pool.query<{ b: Date }>(
      `SELECT public.shop_local_hour(o.placed_at, s.timezone) AS b
         FROM public."order" o, public.shop s WHERE o.id = $1 AND s.id = $2`,
      [orderId, SHOP],
    );
    expect(dirty.rowCount).toBe(1);
    expect(dirty.rows[0]!.bucket_start.toISOString()).toBe(expected.rows[0]!.b.toISOString());
  });

  describe("shop_local_hour", () => {
    it("gives 25 distinct buckets on the day daylight saving ENDS in Melbourne", async () => {
      // 2026-04-05: clocks go back at 03:00 AEDT → 02:00 AEST, so 02:00–03:00 happens twice.
      const res = await pool.query<{ n: string }>(
        `SELECT COUNT(DISTINCT public.shop_local_hour(t, 'Australia/Melbourne'))::text AS n
           FROM generate_series(
             timestamptz '2026-04-04 13:00:00+00',   -- local midnight, AEDT
             timestamptz '2026-04-05 13:59:00+00',   -- local 23:59, AEST
             interval '1 minute') AS t`,
      );
      expect(res.rows[0]!.n).toBe("25");
    });

    it("gives 23 distinct buckets on the day it BEGINS", async () => {
      // 2026-10-04: 02:00 AEST jumps to 03:00 AEDT — that local hour never happens.
      const res = await pool.query<{ n: string }>(
        `SELECT COUNT(DISTINCT public.shop_local_hour(t, 'Australia/Melbourne'))::text AS n
           FROM generate_series(
             timestamptz '2026-10-03 14:00:00+00',
             timestamptz '2026-10-04 12:59:00+00',
             interval '1 minute') AS t`,
      );
      expect(res.rows[0]!.n).toBe("23");
    });

    it("starts local hours at :30 past the UTC hour in a half-hour zone", async () => {
      const res = await pool.query<{ b: Date }>(
        `SELECT public.shop_local_hour(timestamptz '2026-06-01 04:17:00+00', 'Australia/Adelaide') AS b`,
      );
      // Adelaide is UTC+9:30 in June: local 13:47, so the hour began at 13:00 local = 03:30 UTC.
      expect(res.rows[0]!.b.toISOString()).toBe("2026-06-01T03:30:00.000Z");
    });
  });
});
