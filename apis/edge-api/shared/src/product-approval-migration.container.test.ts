import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 067 — THE MIGRATION, PROVEN AGAINST A CATALOGUE THAT ALREADY EXISTS.
 *
 * Every other container test applies the migrations to an EMPTY database, where a backfill has
 * nothing to do and cannot be wrong. This one applies everything BEFORE 067, seeds products in
 * every status and an order with lines, and only then applies 067 — which is what `make db-up` will
 * do to the live catalogue.
 *
 * ⚠ The statement order inside the migration is load-bearing: columns, backfill, THEN the CHECK
 * that an on-sale product must carry an approval. Reversed, it fails on every product already
 * selling. And SC-012 says the day this ships the catalogue looks exactly as it did the day before.
 */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const THIS = "product_approval_margin.sql";

function migrationsDir(): string {
  let cur = __dirname;
  for (let i = 0; i < 12; i += 1) {
    const candidate = resolve(cur, "db", "migrations");
    if (existsSync(candidate)) return candidate;
    cur = dirname(cur);
  }
  throw new Error("db/migrations not found");
}

function upOf(file: string): string {
  const sql = readFileSync(join(migrationsDir(), file), "utf8");
  const up = sql.indexOf("-- +goose Up");
  const down = sql.indexOf("-- +goose Down");
  return sql.slice(up, down === -1 ? undefined : down);
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;
const ids: Record<string, string> = {};
let orderItemId: string;
let fulfillmentId: string;

d("067 — the migration over an existing catalogue", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    const files = readdirSync(migrationsDir()).filter((f) => f.endsWith(".sql")).sort();
    const mine = files.find((f) => f.endsWith(THIS));
    if (!mine) throw new Error("the 067 migration is missing — this test would prove nothing");
    const before = files.filter((f) => f < mine);
    const after = files.filter((f) => f > mine);
    expect(before.length).toBeGreaterThan(50);

    for (const f of before) await pool.query(upOf(f));

    // ── The world as it was the day before ──
    shopId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ('SPRE', 'Pre-067 shop') RETURNING id`,
    )).rows[0]!.id;
    for (const [status, price, was] of [
      ["draft", "3.00", null],
      ["active", "10.00", "12.50"],
      ["unavailable", "7.25", null],
      ["archived", "99.99", null],
    ] as const) {
      ids[status] = (await pool.query<{ id: string }>(
        `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount,
                                     compare_at_amount, short_description, created_by, status)
         SELECT $1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category LIMIT 1),
                $2, $3::numeric, $4::numeric, 'x', 'seed', $2 RETURNING id`,
        [shopId, status, price, was],
      )).rows[0]!.id;
    }
    const cust = (await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email)
       VALUES ('c-pre', 'pre@effyshopping.com') RETURNING id`,
    )).rows[0]!.id;
    const order = (await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount,
                                   delivery_address, status)
       VALUES ($1, 'EFY-PRE001', 20, 20, '{}'::jsonb, 'paid') RETURNING id`,
      [cust],
    )).rows[0]!.id;
    orderItemId = (await pool.query<{ id: string }>(
      `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount,
                                      quantity, line_subtotal_amount)
       VALUES ($1, $2, $3, 'active', 10.00, 2, 20.00) RETURNING id`,
      [order, ids.active, shopId],
    )).rows[0]!.id;
    fulfillmentId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount)
       VALUES ($1, $2, 2, 20.00) RETURNING id`,
      [order, shopId],
    )).rows[0]!.id;

    // ── db-up ──
    await pool.query(upOf(mine));
    for (const f of after) {
      // ⚠ 083's removal of the old delivery arrangement REFUSES while an order sold the old way is
      // still open, and on a database that has taken orders and was never switched over — and this
      // pre-067 database is both. The order is finished and the switch set first, as the business would.
      if (f.startsWith("20261009150000")) {
        await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 'seed')`, [fulfillmentId]);
        await pool.query(
          `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by, delivery_model_v2_from)
           VALUES (1, -37.81, 144.96, 'seed', now() - interval '1 day')
           ON CONFLICT (id) DO UPDATE SET delivery_model_v2_from = EXCLUDED.delivery_model_v2_from`,
        );
      }
      await pool.query(upOf(f));
    }
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const product = async (status: string) =>
    (await pool.query(
      `SELECT status, price_amount::text, compare_at_amount::text, shop_price_amount::text,
              shop_compare_at_amount::text, margin_kind, margin_value, approved_at, review_state
         FROM public.product WHERE id = $1`,
      [ids[status]],
    )).rows[0]!;

  /** ⚠ SC-012. */
  it("⚠ leaves every existing price and status exactly as it was", async () => {
    expect(await product("active")).toMatchObject({ status: "active", price_amount: "10.00", compare_at_amount: "12.50" });
    expect(await product("unavailable")).toMatchObject({ status: "unavailable", price_amount: "7.25" });
    expect(await product("archived")).toMatchObject({ status: "archived", price_amount: "99.99" });
    expect(await product("draft")).toMatchObject({ status: "draft", price_amount: "3.00" });
  });

  it("copies each price into the shop's price, and sets no margin", async () => {
    for (const s of ["draft", "active", "unavailable", "archived"]) {
      const p = await product(s);
      expect(p.shop_price_amount).toBe(p.price_amount);
      expect(p.margin_kind).toBeNull();
      expect(p.margin_value).toBeNull();
      expect(p.review_state).toBe("none");
    }
    expect((await product("active")).shop_compare_at_amount).toBe("12.50");
  });

  /** FR-046 — already on sale means already approved; a draft still has to be submitted. */
  it("treats everything past draft as approved, and a draft as not", async () => {
    expect((await product("active")).approved_at).not.toBeNull();
    expect((await product("unavailable")).approved_at).not.toBeNull();
    expect((await product("archived")).approved_at).not.toBeNull();
    expect((await product("draft")).approved_at).toBeNull();
  });

  it("lists exactly the approved products as 'margin not set'", async () => {
    const res = await pool.query<{ id: string }>(
      `SELECT id FROM public.product WHERE approved_at IS NOT NULL AND margin_kind IS NULL`,
    );
    expect(res.rows.map((r) => r.id).sort()).toEqual([ids.active, ids.unavailable, ids.archived].sort());
  });

  /** FR-047. */
  it("reads every earlier order as owing the shop what the customer paid", async () => {
    const line = (await pool.query(
      `SELECT unit_price_amount::text, line_subtotal_amount::text, shop_unit_price_amount::text,
              shop_line_subtotal_amount::text FROM public.order_item WHERE id = $1`,
      [orderItemId],
    )).rows[0]!;
    expect(line).toEqual({
      unit_price_amount: "10.00",
      line_subtotal_amount: "20.00",
      shop_unit_price_amount: "10.00",
      shop_line_subtotal_amount: "20.00",
    });
    const portion = (await pool.query(
      `SELECT subtotal_amount::text, shop_subtotal_amount::text FROM public.shop_fulfillment WHERE id = $1`,
      [fulfillmentId],
    )).rows[0]!;
    expect(portion).toEqual({ subtotal_amount: "20.00", shop_subtotal_amount: "20.00" });
  });

  /** ⚠ FR-001 — the table's own rule, for a caller that skipped every service. */
  it("⚠ refuses to put a never-approved product on sale", async () => {
    await expect(
      pool.query(`UPDATE public.product SET status = 'active' WHERE id = $1`, [ids.draft]),
    ).rejects.toThrow(/product_active_requires_approval_check/);
    await expect(
      pool.query(`UPDATE public.product SET status = 'active', approved_at = now() WHERE id = $1`, [ids.draft]),
    ).resolves.toBeDefined();
  });

  it("refuses a margin with a kind and no value, a negative one, and review state on an approved product", async () => {
    await expect(
      pool.query(`UPDATE public.product SET margin_kind = 'percent' WHERE id = $1`, [ids.active]),
    ).rejects.toThrow();
    await expect(
      pool.query(`UPDATE public.product SET margin_kind = 'amount', margin_value = -1 WHERE id = $1`, [ids.active]),
    ).rejects.toThrow();
    await expect(
      pool.query(`UPDATE public.product SET review_state = 'in_review', submitted_at = now() WHERE id = $1`, [ids.active]),
    ).rejects.toThrow();
  });

  it("allows one open change per product, and no more", async () => {
    await pool.query(
      `INSERT INTO public.product_change (product_id, shop_id, proposed) VALUES ($1, $2, '{"name":"New"}'::jsonb)`,
      [ids.active, shopId],
    );
    await expect(
      pool.query(
        `INSERT INTO public.product_change (product_id, shop_id, proposed) VALUES ($1, $2, '{"name":"Again"}'::jsonb)`,
        [ids.active, shopId],
      ),
    ).rejects.toThrow(/product_change_product_uq/);
  });

  it("admits the two new shop notification types", async () => {
    for (const type of ["shop_product_approved", "shop_product_sent_back"]) {
      await expect(
        pool.query(
          `INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
           VALUES ('sub-1', 'shop', $1, '{}'::jsonb, $1 || ':sub-1:x')`,
          [type],
        ),
      ).resolves.toBeDefined();
    }
  });
});
