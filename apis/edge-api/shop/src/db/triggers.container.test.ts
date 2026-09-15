import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The triggers, against real PostgreSQL and THE REAL MIGRATIONS (058).
 *
 * ⚠ WHY THIS CANNOT BE A UNIT TEST. The two properties the whole design rests on are properties of
 * PostgreSQL, not of our code: a NOTIFY is delivered **only if the transaction commits**, and the
 * dirty mark lands **in the same transaction as the change it describes**. Mocking either would
 * assert that our fixture agrees with our belief — 027 R13's failure mode. The one way to know is to
 * roll a transaction back and watch nothing arrive.
 */

const RUN = process.env.CONTAINER_TESTS === "1";

function applyMigrations(): string {
  const dir = resolve(import.meta.dirname, "../../../../../db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error("no migrations found — this harness would pass vacuously");
  return files
    .map((f) => {
      const body = readFileSync(join(dir, f), "utf8");
      const start = body.indexOf("-- +goose Up");
      const rest = start < 0 ? body : body.slice(start);
      const end = rest.indexOf("-- +goose Down");
      return end < 0 ? rest : rest.slice(0, end);
    })
    .join("\n");
}

const CUST = "11111111-1111-4111-8111-111111111111";
const SHOP = "33333333-3333-4333-8333-333333333333";

describe.skipIf(!RUN)("shop_ops triggers — real PostgreSQL, real migrations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  /** A dedicated LISTENer, exactly as core-api holds one (contracts/shop-live-stream). */
  let listener: Client;
  let heard: string[] = [];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(applyMigrations());

    listener = new Client({ connectionString: container.getConnectionUri() });
    await listener.connect();
    listener.on("notification", (n) => heard.push(n.payload ?? ""));
    await listener.query("LISTEN shop_ops");
  }, 180_000);

  afterAll(async () => {
    await listener?.end();
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
    heard = [];
  });

  /**
   * Forget the fixture's own work.
   *
   * ⚠ Building an order is itself a change the triggers watch — `order_item` insertion marks the
   * bucket dirty (20260915171139), exactly as it must. So a test about what ONE later change does has
   * to start from a clean queue, or it asserts the fixture's marks instead of its own subject.
   */
  async function forgetFixtureWork(): Promise<void> {
    await pool.query(`DELETE FROM public.insights_dirty`);
    heard = [];
  }

  /** Notifications are delivered asynchronously; give the listener a moment to see them. */
  async function settle(): Promise<void> {
    await listener.query("SELECT 1");
    await new Promise((r) => setTimeout(r, 50));
  }

  async function paidOrder(number: string): Promise<{ orderId: string; fulfillmentId: string }> {
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
         delivery_fee_amount, grand_total_amount, delivery_address, placed_at)
       VALUES ($1,$2,'pending_payment',30,0,30,'{"recipientName":"Ada"}'::jsonb, now()) RETURNING id`,
      [CUST, number],
    );
    const orderId = o.rows[0]!.id;
    const p = await pool.query<{ id: string }>(
      `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount,
         short_description, created_by, status)
       SELECT $1, pt.id, c.id, 'Milk', 10, 'x', 'seed', 'active'
         FROM public.product_type pt, public.category c
       RETURNING id`,
      [SHOP],
    );
    await pool.query(
      `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
       VALUES ($1,$2,$3,'Milk',10,3,30)`,
      [orderId, p.rows[0]!.id, SHOP],
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount)
       VALUES ($1,$2,3,30) RETURNING id`,
      [orderId, SHOP],
    );
    return { orderId, fulfillmentId: f.rows[0]!.id };
  }

  it("a committed refund marks exactly one bucket and pokes the shop", async () => {
    const { orderId } = await paidOrder("EFY-T1");
    await forgetFixtureWork();
    await pool.query(
      `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind, actor_sub)
       VALUES ($1,'item',10,'item_not_supplied','k-1','back_office','sub-staff')`,
      [orderId],
    );
    await settle();

    const dirty = await pool.query(`SELECT shop_id, bucket_start FROM public.insights_dirty`);
    expect(dirty.rowCount).toBe(1);
    expect(dirty.rows[0]!.shop_id).toBe(SHOP);
    expect(heard).toContain(SHOP);
  });

  it("⚠ a ROLLED-BACK refund leaves no dirty mark and sends no poke", async () => {
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
    await settle();

    const dirty = await pool.query(`SELECT 1 FROM public.insights_dirty`);
    expect(dirty.rowCount, "a rolled-back change must leave no work behind").toBe(0);
    expect(heard, "NOTIFY is delivered only on commit — this is the whole reason it is a trigger").toEqual([]);
  });

  it("many changes in ONE transaction collapse to a single poke", async () => {
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
          // The line is 3 units, and `fulfillment_item_accounted_ck` refuses more gathered than
          // ordered — so the five picks cycle 1,2,3,1,2 rather than counting past the order.
          [fulfillmentId, item.rows[0]!.id, ((i - 1) % 3) + 1],
        );
      }
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    await settle();

    expect(
      heard.filter((p) => p === SHOP).length,
      "identical payloads in one transaction collapse — a 20-line pick must wake a console once",
    ).toBe(1);
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
