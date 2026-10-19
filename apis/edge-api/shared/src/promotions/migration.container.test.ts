import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";

/**
 * 094 — the promotions migration against the REAL schema: the old model is copied (codes, uses,
 * carts, advertised banners into groups), and the rules the database itself keeps — state and a
 * single-use code held once — hold. (Frozen-after-use, the fixed key and the headline rule are the
 * admin service's, tested there.)
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const MIGRATION = "20261020090000_promotions_rebuild.sql";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let seq = 0;

const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;

async function customer() {
  const tag = `pm-${++seq}`;
  return (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [tag, `${tag}@example.test`])).id;
}

async function order(customerId: string, status = "paid") {
  return (
    await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
       VALUES ($1, $2, $3, 'AUD', 40.00, 40.00, 0, '{}'::jsonb) RETURNING id::text AS id`,
      [customerId, `EFY-PM${++seq}`, status],
    )
  ).id;
}

async function oldCode(code: string, extra: Record<string, unknown> = {}) {
  const cols = { kind: "percentage", percent_off: 10, amount_off: null, created_by: "staff-1", ...extra };
  const keys = Object.keys(cols);
  const vals = Object.values(cols);
  return (
    await one<{ id: string }>(
      `INSERT INTO public.promo_code (code, ${keys.join(", ")}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id::text AS id`,
      [code, ...vals],
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

async function use(promotionId: string, status: "held" | "confirmed", amount = 5, expires = new Date(Date.now() + 600_000)) {
  const c = await customer();
  const o = await order(c, "pending_payment");
  await pool.query(
    `INSERT INTO public.promotion_use (promotion_id, customer_id, order_id, goods_amount, status, hold_expires_at, confirmed_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'confirmed' THEN now() END)`,
    [promotionId, c, o, amount, status, status === "held" ? expires : null],
  );
}

const state = async (id: string) => (await one<{ s: string }>(`SELECT public.promotion_state($1) AS s`, [id])).s;

let advertisedCarousel: string;
let advertisedInline: string;
let plain: string;
let disabled: string;
let redeemingCustomer: string;
let redeemedOrder: string;
let cartId: string;

d("094 — the promotions migration", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql({ before: MIGRATION }));

    // The old model, as dev has it.
    advertisedCarousel = await oldCode("SPRING20", {
      kind: "percentage", percent_off: 20, minimum_subtotal_amount: 40, max_redemptions: 500, max_per_customer: 1,
      is_advertised: true, banner_title: "20% off your spring shop", banner_subtitle: "This month only", banner_position: 1, banner_placement: "carousel",
    });
    advertisedInline = await oldCode("WELCOME10", {
      kind: "fixed", percent_off: null, amount_off: 10, is_advertised: true, banner_title: "$10 off", banner_position: 0, banner_placement: "inline",
    });
    plain = await oldCode("STAFF5", { kind: "fixed", percent_off: null, amount_off: 5 });
    disabled = await oldCode("OLD15", { status: "disabled" });

    redeemingCustomer = await customer();
    redeemedOrder = await order(redeemingCustomer);
    await pool.query(`UPDATE public."order" SET promo_code_id = $1, promo_code = 'SPRING20', discount_amount = 8 WHERE id = $2`, [advertisedCarousel, redeemedOrder]);
    await pool.query(`INSERT INTO public.promo_redemption (promo_code_id, customer_id, order_id, amount) VALUES ($1, $2, $3, 8)`, [advertisedCarousel, redeemingCustomer, redeemedOrder]);
    cartId = (await one<{ id: string }>(`INSERT INTO public.cart (customer_id, promo_code_id) VALUES ($1, $2) RETURNING id::text AS id`, [redeemingCustomer, plain])).id;

    await pool.query(migrationSql({ from: MIGRATION }));
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("copies every code as a cart promotion with one shared code, keeping its value, minimum and caps", async () => {
    const p = await one<Record<string, unknown>>(
      `SELECT p.kind, p.trigger, p.value_type, p.percent_off::text, p.min_subtotal_amount::text, p.max_uses, p.max_uses_per_customer,
              p.headline, p.supporting_line, c.code, c.single_use
         FROM public.promotion p JOIN public.promotion_code c ON c.promotion_id = p.id
        WHERE p.legacy_promo_code_id = $1`,
      [advertisedCarousel],
    );
    expect(p).toMatchObject({
      kind: "cart", trigger: "code", value_type: "percent", percent_off: "20.00", min_subtotal_amount: "40.00",
      max_uses: 500, max_uses_per_customer: 1, headline: "20% off your spring shop", supporting_line: "This month only",
      code: "SPRING20", single_use: false,
    });
    const fixed = await one<{ value_type: string; amount_off: string }>(`SELECT value_type, amount_off::text FROM public.promotion WHERE legacy_promo_code_id = $1`, [plain]);
    expect(fixed).toEqual({ value_type: "amount", amount_off: "5.00" });
  });

  it("a disabled code becomes a paused promotion", async () => {
    const p = await one<{ id: string }>(`SELECT id::text FROM public.promotion WHERE legacy_promo_code_id = $1`, [disabled]);
    expect(await state(p.id)).toBe("paused");
  });

  it("copies each redemption as a confirmed use, and the cart's code", async () => {
    const u = await one<{ status: string; goods_amount: string; customer_id: string }>(
      `SELECT status, goods_amount::text, customer_id::text FROM public.promotion_use WHERE order_id = $1`,
      [redeemedOrder],
    );
    expect(u).toEqual({ status: "confirmed", goods_amount: "8.00", customer_id: redeemingCustomer });
    const c = await one<{ code: string }>(
      `SELECT pc.code FROM public.cart ct JOIN public.promotion_code pc ON pc.id = ct.promotion_code_id WHERE ct.id = $1`,
      [cartId],
    );
    expect(c.code).toBe("STAFF5");
  });

  it("places advertised codes into the starting groups, in their old order", async () => {
    const rows = (
      await pool.query<{ key: string; code: string; position: number }>(
        `SELECT g.key, pc.code, m.position
           FROM public.promotion_group_member m
           JOIN public.promotion_group g ON g.id = m.group_id
           JOIN public.promotion p ON p.id = m.promotion_id
           JOIN public.promotion_code pc ON pc.promotion_id = p.id
          ORDER BY g.key, m.position`,
      )
    ).rows;
    expect(rows).toEqual([
      { key: "home-between", code: "WELCOME10", position: 0 },
      { key: "home-hero", code: "SPRING20", position: 0 },
      { key: "offers", code: "SPRING20", position: 0 },
    ]);
    const keys = (await pool.query<{ key: string }>(`SELECT key FROM public.promotion_group ORDER BY sort`)).rows.map((r) => r.key);
    expect(keys).toEqual(["home-hero", "home-side", "home-between", "offers", "cart"]);
    expect(advertisedInline).toBeTruthy();
  });

  it("works out every state, counting held uses only until they expire", async () => {
    expect(await state(await promotion({ published_at: null }))).toBe("draft");
    expect(await state(await promotion({ archived_at: new Date() }))).toBe("archived");
    expect(await state(await promotion({ ends_at: new Date(Date.now() - 1000), starts_at: new Date(Date.now() - 5000) }))).toBe("ended");
    expect(await state(await promotion({ ended_at: new Date(Date.now() - 1000) }))).toBe("ended");
    expect(await state(await promotion({ paused: true }))).toBe("paused");
    expect(await state(await promotion({ starts_at: new Date(Date.now() + 86_400_000) }))).toBe("scheduled");

    const capped = await promotion({ max_uses: 1 });
    expect(await state(capped)).toBe("active");
    await use(capped, "held");
    expect(await state(capped)).toBe("used_up");

    const lapsed = await promotion({ max_uses: 1 });
    await use(lapsed, "held", 5, new Date(Date.now() - 1000));
    expect(await state(lapsed)).toBe("active");

    const budget = await promotion({ budget_amount: 10 });
    await use(budget, "confirmed", 6);
    expect(await state(budget)).toBe("active");
    await use(budget, "confirmed", 4);
    expect(await state(budget)).toBe("out_of_budget");
  });

  it("lets a single-use code be held by one order only", async () => {
    const p = await promotion({ trigger: "code" });
    const code = await one<{ id: string }>(
      `INSERT INTO public.promotion_code (promotion_id, code, single_use, batch_id) VALUES ($1, $2, true, gen_random_uuid()) RETURNING id::text AS id`,
      [p, `ONE${seq}X`],
    );
    const insert = async () => {
      const c = await customer();
      const o = await order(c, "pending_payment");
      return pool.query(
        `INSERT INTO public.promotion_use (promotion_id, code_id, single_use, customer_id, order_id, status, hold_expires_at)
         VALUES ($1, $2, true, $3, $4, 'held', now() + interval '10 minutes')`,
        [p, code.id, c, o],
      );
    };
    await insert();
    await expect(insert()).rejects.toThrow(/promotion_use_code_once/);
  });
});
