import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { variantPurchasableSql } from "../lib/availability";
import { transactorFor, type Transactor } from "../lib/db";
import { finalizeAbandoned, finalizeFailed } from "../payments/finalize";
import { insertTestProduct } from "../testing/catalog-fixture";
import { migrationSql } from "../testing/migrations";
import { consumeStockHolds, holdStock, releaseStockHolds } from "./holds";

/**
 * 114: checkout stock holds against the real schema - the last units go to one shopper (SC-001, FR-004), a hold runs
 * out by itself (FR-005), a shopper's own holds are theirs (FR-003), a changed basket replaces holds (FR-006), and every
 * way an order ends takes its holds with it (FR-010–FR-012a).
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let shopId: string;
let categoryId: string;
let seq = 0;

const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;

async function counted(onHand: number): Promise<{ productId: string; variantId: string }> {
  return insertTestProduct(pool, { shopId, primaryCategoryId: categoryId, name: `Held ${++seq}`, price: "3.00", shopPrice: "3.00", tracked: true, onHand });
}

async function customer(): Promise<string> {
  const tag = `sh-${++seq}`;
  return (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [tag, `${tag}@example.test`])).id;
}

/** An unpaid order for `customerId` with one line per entry. */
async function order(customerId: string, lines: { productId: string; variantId: string; qty: number }[]): Promise<string> {
  const orderId = (
    await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
       VALUES ($1, $2, 'pending_payment', 'AUD', 10, 10, 0, '{}'::jsonb) RETURNING id::text AS id`,
      [customerId, `EFY-SH${++seq}`],
    )
  ).id;
  for (const l of lines) {
    await pool.query(
      `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount,
                                      shop_unit_price_amount, shop_line_subtotal_amount, variant_id)
       VALUES ($1, $2, $3, 'x', 3, $4, 3 * $4, 3, 3 * $4, $5)`,
      [orderId, l.productId, shopId, l.qty, l.variantId],
    );
  }
  return orderId;
}

const held = async (variantId: string) =>
  Number((await one<{ n: string }>(`SELECT COALESCE(sum(quantity), 0) AS n FROM public.stock_hold WHERE variant_id = $1 AND held_until > now()`, [variantId])).n);
const rows = async (orderId: string) =>
  Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.stock_hold WHERE order_id = $1`, [orderId])).n);
const shelf = async (variantId: string) =>
  (await one<{ n: number }>(`SELECT stock_on_hand AS n FROM public.product_variant WHERE id = $1`, [variantId])).n;
/** The one rule, for a shopper (or nobody). */
const sellable = async (variantId: string, customerId: string | null) =>
  (
    await pool.query(
      `SELECT 1 FROM public.product_variant v JOIN public.product p ON p.id = v.product_id
        WHERE v.id = $1 AND ${variantPurchasableSql("p", "v", "$2::uuid")}`,
      [variantId, customerId],
    )
  ).rowCount === 1;

d("114 - checkout stock holds", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 25 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
    shopId = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('SH', 'Hold shop') RETURNING id::text AS id`)).id;
    categoryId = (await one<{ id: string }>(`INSERT INTO public.category (key, name) VALUES ('sh-cat', 'Holds') RETURNING id::text AS id`)).id;
  }, 300_000);

  beforeEach(async () => {
    await pool.query(`UPDATE public.housekeeping_settings SET stock_hold_min = 15`);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("SC-001: twenty shoppers race for five units - exactly five are held, the shelf never moves", async () => {
    const p = await counted(5);
    const orders = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const c = await customer();
        return { c, o: await order(c, [{ ...p, qty: 1 }]) };
      }),
    );
    const results = await Promise.all(orders.map(({ c, o }) => transact((tx) => holdStock(tx, { orderId: o, customerId: c }))));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok)).toHaveLength(15);
    expect(await held(p.variantId)).toBe(5);
    expect(await shelf(p.variantId)).toBe(5);
    expect(await sellable(p.variantId, null)).toBe(false);
  });

  it("two shoppers for the last unit: one gets it; the other's checkout holds nothing", async () => {
    const p = await counted(1);
    const [a, b] = [await customer(), await customer()];
    const [oa, ob] = [await order(a, [{ ...p, qty: 1 }]), await order(b, [{ ...p, qty: 1 }])];
    const [ra, rb] = await Promise.all([
      transact((tx) => holdStock(tx, { orderId: oa, customerId: a })),
      transact((tx) => holdStock(tx, { orderId: ob, customerId: b })),
    ]);
    expect([ra.ok, rb.ok].sort()).toEqual([false, true]);
    expect((await rows(oa)) + (await rows(ob))).toBe(1);
  });

  it("FR-003: a shopper's own hold is theirs - their cart still sells it to them, nobody else's does", async () => {
    const p = await counted(1);
    const [a, b] = [await customer(), await customer()];
    const oa = await order(a, [{ ...p, qty: 1 }]);
    expect((await transact((tx) => holdStock(tx, { orderId: oa, customerId: a }))).ok).toBe(true);
    expect(await sellable(p.variantId, a)).toBe(true);
    expect(await sellable(p.variantId, b)).toBe(false);
    // A second unpaid order of the SAME customer is not blocked by the first (research R3).
    const oa2 = await order(a, [{ ...p, qty: 1 }]);
    expect((await transact((tx) => holdStock(tx, { orderId: oa2, customerId: a }))).ok).toBe(true);
  });

  it("an uncounted size is never held", async () => {
    const p = await insertTestProduct(pool, { shopId, primaryCategoryId: categoryId, name: `Free ${++seq}`, price: "1.00", shopPrice: "1.00" });
    const c = await customer();
    const o = await order(c, [{ ...p, qty: 3 }]);
    const r = await transact((tx) => holdStock(tx, { orderId: o, customerId: c }));
    expect(r).toMatchObject({ ok: true, counted: false });
    expect(await rows(o)).toBe(0);
  });

  it("FR-005: a hold that ran out stops counting by itself - nothing sweeps the row", async () => {
    const p = await counted(1);
    const [a, b] = [await customer(), await customer()];
    const oa = await order(a, [{ ...p, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: oa, customerId: a }));
    expect(await sellable(p.variantId, b)).toBe(false);
    await pool.query(`UPDATE public.stock_hold SET held_until = now() - interval '1 second' WHERE order_id = $1`, [oa]);
    expect(await rows(oa)).toBe(1);
    expect(await sellable(p.variantId, b)).toBe(true);
    const ob = await order(b, [{ ...p, qty: 1 }]);
    expect((await transact((tx) => holdStock(tx, { orderId: ob, customerId: b }))).ok).toBe(true);
  });

  it("FR-006: a changed basket replaces the order's holds, with a fresh hold time", async () => {
    const [p, q] = [await counted(5), await counted(5)];
    const c = await customer();
    const o = await order(c, [{ ...p, qty: 2 }, { ...q, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: o, customerId: c }));
    await pool.query(`UPDATE public.stock_hold SET held_until = now() - interval '1 minute' WHERE order_id = $1`, [o]);
    // The shopper drops q and pays again.
    await pool.query(`DELETE FROM public.order_item WHERE order_id = $1 AND variant_id = $2`, [o, q.variantId]);
    const r = await transact((tx) => holdStock(tx, { orderId: o, customerId: c }));
    expect(r).toMatchObject({ ok: true, lapsedReplaced: 2, liveReplaced: 0 });
    expect(await rows(o)).toBe(1);
    expect(await held(p.variantId)).toBe(2);
    expect(await held(q.variantId)).toBe(0);
  });

  it("the hold time is the setting's at the moment of holding; a change leaves existing holds alone", async () => {
    const p = await counted(5);
    const [a, b] = [await customer(), await customer()];
    const oa = await order(a, [{ ...p, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: oa, customerId: a }));
    const before = await one<{ until: Date }>(`SELECT held_until AS until FROM public.stock_hold WHERE order_id = $1`, [oa]);
    await pool.query(`UPDATE public.housekeeping_settings SET stock_hold_min = 5`);
    const after = await one<{ until: Date }>(`SELECT held_until AS until FROM public.stock_hold WHERE order_id = $1`, [oa]);
    expect(after.until).toEqual(before.until);
    const ob = await order(b, [{ ...p, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: ob, customerId: b }));
    const mins = await one<{ m: number }>(
      `SELECT round(extract(epoch FROM held_until - created_at) / 60)::int AS m FROM public.stock_hold WHERE order_id = $1`,
      [ob],
    );
    expect(mins.m).toBe(5);
    expect(Math.round((before.until.getTime() - Date.now()) / 60_000)).toBeGreaterThanOrEqual(14);
  });

  it("refused under the lock: the order's earlier holds go too, so nothing stays held", async () => {
    const p = await counted(2);
    const [a, b] = [await customer(), await customer()];
    const oa = await order(a, [{ ...p, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: oa, customerId: a }));
    // A's basket grows to 2, but B now holds one of the two.
    const ob = await order(b, [{ ...p, qty: 1 }]);
    await pool.query(`UPDATE public.stock_hold SET held_until = now() - interval '1 second' WHERE order_id = $1`, [oa]);
    expect((await transact((tx) => holdStock(tx, { orderId: ob, customerId: b }))).ok).toBe(true);
    await pool.query(`UPDATE public.order_item SET quantity = 2 WHERE order_id = $1`, [oa]);
    const r = await transact((tx) => holdStock(tx, { orderId: oa, customerId: a }));
    expect(r.ok).toBe(false);
    expect(await rows(oa)).toBe(0);
  });

  it("FR-011 / FR-012a: abandoned and failed orders take their holds with them", async () => {
    const p = await counted(3);
    const c = await customer();
    const oa = await order(c, [{ ...p, qty: 1 }]);
    const of = await order(c, [{ ...p, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: oa, customerId: c }));
    await transact((tx) => holdStock(tx, { orderId: of, customerId: c }));
    const ab = await transact((tx) => finalizeAbandoned(tx, oa));
    expect(ab.stockReleased).toMatchObject({ released: 1, lapsed: 0, shopIds: [shopId] });
    const fa = await transact((tx) => finalizeFailed(tx, of));
    expect(fa).toMatchObject({ released: 1, shopIds: [shopId] });
    expect((await rows(oa)) + (await rows(of))).toBe(0);
  });

  it("releaseStockHolds and consumeStockHolds say whether a payment outran its hold", async () => {
    const p = await counted(3);
    const c = await customer();
    const live = await order(c, [{ ...p, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: live, customerId: c }));
    expect(await transact((tx) => consumeStockHolds(tx, live))).toMatchObject({ hadCountedLines: true, late: false, ended: { live: 1, lapsed: 0 } });

    const late = await order(c, [{ ...p, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: late, customerId: c }));
    await pool.query(`UPDATE public.stock_hold SET held_until = now() - interval '1 second' WHERE order_id = $1`, [late]);
    expect(await transact((tx) => consumeStockHolds(tx, late))).toMatchObject({ late: true, ended: { live: 0, lapsed: 1 } });

    const none = await order(c, [{ ...p, qty: 1 }]);
    expect(await transact((tx) => consumeStockHolds(tx, none))).toMatchObject({ hadCountedLines: true, late: true });
    expect(await transact((tx) => releaseStockHolds(tx, none))).toMatchObject({ released: 0 });
  });

  it("a shop lowering its count below what is held: left to sell reads 0, never negative, and nothing is written", async () => {
    const p = await counted(4);
    const c = await customer();
    const o = await order(c, [{ ...p, qty: 3 }]);
    await transact((tx) => holdStock(tx, { orderId: o, customerId: c }));
    await pool.query(`UPDATE public.product_variant SET stock_on_hand = 1 WHERE id = $1`, [p.variantId]);
    expect(await sellable(p.variantId, null)).toBe(false);
    expect(await rows(o)).toBe(1);
  });

  it("FR-013: counting turned off - holds stop counting at once, and the size sells as uncounted", async () => {
    const p = await counted(1);
    const [a, b] = [await customer(), await customer()];
    const oa = await order(a, [{ ...p, qty: 1 }]);
    await transact((tx) => holdStock(tx, { orderId: oa, customerId: a }));
    expect(await sellable(p.variantId, b)).toBe(false);
    await pool.query(`UPDATE public.product_variant SET stock_tracked = false, stock_on_hand = NULL WHERE id = $1`, [p.variantId]);
    expect(await sellable(p.variantId, b)).toBe(true);
  });
});
