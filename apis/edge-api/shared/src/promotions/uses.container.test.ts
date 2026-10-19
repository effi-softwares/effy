import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../lib/db";
import { migrationSql } from "../lib/load-migrations";

import type { AppliedPromotion } from "./engine";
import { candidatesFor, findCode, groupPromotions } from "./candidates";
import { confirmUses, holdUses, PromotionsChangedError, releaseUses } from "./uses";

/**
 * 094 — holds against the REAL schema (SC-004). "No promotion gives more than its cap or its budget,
 * even when many shoppers check out at the same moment" is a row lock and a re-count, so it is proven
 * with concurrent transactions, not mocks.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;

const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;

async function customer() {
  const tag = `pu-${++seq}`;
  return (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [tag, `${tag}@example.test`])).id;
}

async function order(customerId: string, status = "pending_payment") {
  return (
    await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
       VALUES ($1, $2, $3, 'AUD', 40.00, 40.00, 0, '{}'::jsonb) RETURNING id::text AS id`,
      [customerId, `EFY-PU${++seq}`, status],
    )
  ).id;
}

async function promotion(extra: Record<string, unknown> = {}) {
  const cols = {
    name: `P${++seq}`, kind: "cart", trigger: "automatic", value_type: "amount", amount_off: 5, applies_to: "cart",
    published_at: new Date(Date.now() - 60_000), created_by: "staff-1", ...extra,
  };
  const keys = Object.keys(cols);
  return (
    await one<{ id: string }>(
      `INSERT INTO public.promotion (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id::text AS id`,
      Object.values(cols),
    )
  ).id;
}

const applied = (promotionId: string, goodsCents = 500, codeId: string | null = null): AppliedPromotion => ({
  promotionId, codeId, codeText: null, kind: "cart", goodsCents, deliveryCents: 0, lines: [], awaitingDeliveryFee: false,
});

const hold = (orderId: string, customerId: string, a: AppliedPromotion[], single = new Set<string>()) =>
  transact((tx) => holdUses(tx, { orderId, customerId, applied: a, singleUseCodeIds: single, expiresAt: new Date(Date.now() + 600_000), now: new Date() }));

async function race(n: number, promotionId: string, goodsCents = 500, codeId: string | null = null) {
  const shoppers = await Promise.all(Array.from({ length: n }, async () => {
    const c = await customer();
    return { c, o: await order(c) };
  }));
  const single = new Set(codeId ? [codeId] : []);
  return Promise.allSettled(shoppers.map(({ c, o }) => hold(o, c, [applied(promotionId, goodsCents, codeId)], single)));
}

d("094 — promotion uses under concurrency", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 16 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("ten shoppers at once against the last use: exactly one hold wins", async () => {
    const p = await promotion({ max_uses: 1 });
    const results = await race(10, p);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(PromotionsChangedError);
    }
  });

  it("a budget is never overspent, and a discount that does not fit whole is refused", async () => {
    const p = await promotion({ budget_amount: 12 });
    const results = await race(6, p, 500);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2); // $5 + $5 fit $12; a third does not
    const given = await one<{ g: string }>(`SELECT sum(goods_amount)::text AS g FROM public.promotion_use WHERE promotion_id = $1 AND status = 'held'`, [p]);
    expect(given.g).toBe("10.00");
  });

  it("a single-use code is held by one order only, and a lapsed hold frees it", async () => {
    const p = await promotion({ trigger: "code" });
    const code = await one<{ id: string }>(
      `INSERT INTO public.promotion_code (promotion_id, code, single_use, batch_id) VALUES ($1, 'SOLO42AB', true, gen_random_uuid()) RETURNING id::text AS id`,
      [p],
    );
    const results = await race(5, p, 500, code.id);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await findCode(pool, "solo 42ab", new Date()))?.taken).toBe(true);

    await pool.query(`UPDATE public.promotion_use SET hold_expires_at = now() - interval '1 minute' WHERE code_id = $1 AND status = 'held'`, [code.id]);
    const c = await customer();
    await hold(await order(c), c, [applied(p, 500, code.id)], new Set([code.id]));
  });

  it("a newer intent supersedes the older one; payment confirms; cancellation releases", async () => {
    const a = await promotion();
    const b = await promotion();
    const c = await customer();
    const o = await order(c);
    await hold(o, c, [applied(a), applied(b)]);
    await hold(o, c, [applied(b, 300)]);
    const rows = (await pool.query<{ promotion_id: string; status: string; goods_amount: string }>(
      `SELECT promotion_id::text, status, goods_amount::text FROM public.promotion_use WHERE order_id = $1 ORDER BY status`, [o],
    )).rows;
    expect(rows).toEqual([
      { promotion_id: b, status: "held", goods_amount: "3.00" },
      { promotion_id: a, status: "released", goods_amount: "5.00" },
    ]);
    await transact((tx) => confirmUses(tx, o));
    expect((await one<{ status: string }>(`SELECT status FROM public.promotion_use WHERE order_id = $1 AND promotion_id = $2`, [o, b])).status).toBe("confirmed");
    await transact((tx) => releaseUses(tx, o, "cancelled"));
    expect((await one<{ n: string }>(`SELECT count(*)::text AS n FROM public.promotion_use WHERE order_id = $1 AND status = 'released'`, [o])).n).toBe("2");
  });

  it("per customer: a second use by the same shopper is refused", async () => {
    const p = await promotion({ max_uses_per_customer: 1 });
    const c = await customer();
    await hold(await order(c), c, [applied(p)]);
    await expect(hold(await order(c), c, [applied(p)])).rejects.toBeInstanceOf(PromotionsChangedError);
  });

  it("offers a first-order promotion only to a shopper who has not ordered, and a group shows it only to them", async () => {
    const p = await promotion({ audience: "first_order", headline: "Welcome" });
    const g = await one<{ id: string }>(`SELECT id::text FROM public.promotion_group WHERE key = 'home-side'`);
    await pool.query(`INSERT INTO public.promotion_group_member (group_id, promotion_id, position) VALUES ($1, $2, 0)`, [g.id, p]);
    const fresh = await customer();
    const regular = await customer();
    await order(regular, "paid");
    const now = new Date();
    const forFresh = await candidatesFor(pool, { customerId: fresh, enteredCodeId: null, now });
    const forRegular = await candidatesFor(pool, { customerId: regular, enteredCodeId: null, now });
    expect(forFresh.candidates.map((c) => c.id)).toContain(p);
    expect(forRegular.candidates.map((c) => c.id)).not.toContain(p);

    const [mine] = await groupPromotions(pool, ["home-side"], { customerId: fresh, now });
    const [theirs] = await groupPromotions(pool, ["home-side"], { customerId: regular, now });
    const [anon] = await groupPromotions(pool, ["home-side", "no-such-group"], { customerId: null, now });
    expect(mine!.promotions.map((x) => x.id)).toEqual([p]);
    expect(theirs!.promotions).toEqual([]);
    expect(anon!.promotions).toEqual([]);
  });
});
