import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Availability (099) against the real migrations: which sizes are listed, searched, filtered and guarded. */

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]) };
});

import { readAvailability } from "./repository";

const RUN = process.env.CONTAINER_TESTS === "1";

const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER_SHOP = "33333333-3333-4333-8333-000000000000";

describe.skipIf(!RUN)("Availability — real PostgreSQL, real migrations", () => {
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
    await pool.query(`TRUNCATE public.shop, public.product_type, public.category RESTART IDENTITY CASCADE`);
    await pool.query(`INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'), ($2,'S2','Shop Two')`, [SHOP, OTHER_SHOP]);
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('grocery','Grocery')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('dairy','Dairy')`);
  });

  /** A product with one size per entry, in `status`; returns the variant ids in order. */
  async function product(
    name: string,
    sizes: { sku?: string; gtin?: string; state?: string; onHand?: number | null }[],
    opts: { status?: string; shop?: string } = {},
  ): Promise<string[]> {
    const status = opts.status ?? "active";
    const p = await pool.query<{ id: string }>(
      `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, short_description, created_by, status, approved_at)
       SELECT $1, pt.id, c.id, $2, 'x', 'seed', $3, CASE WHEN $3 = 'draft' THEN NULL ELSE now() END
         FROM public.product_type pt, public.category c RETURNING id`,
      [opts.shop ?? SHOP, name, status],
    );
    // One size: no options. Several: a "Size" option with one value per size, as the editor writes them.
    const option =
      sizes.length > 1
        ? (await pool.query<{ id: string }>(
            `INSERT INTO public.product_option (product_id, "position", name) VALUES ($1, 1, 'Size') RETURNING id`,
            [p.rows[0]!.id],
          )).rows[0]!.id
        : null;
    const ids: string[] = [];
    for (const [i, s] of sizes.entries()) {
      const value = option
        ? (await pool.query<{ id: string }>(
            `INSERT INTO public.product_option_value (option_id, value, "position") VALUES ($1, $2, $3) RETURNING id`,
            [option, `Size ${i + 1}`, i],
          )).rows[0]!.id
        : null;
      const v = await pool.query<{ id: string }>(
        `INSERT INTO public.product_variant (product_id, shop_id, option1_value_id, "position", shop_price_amount, price_amount, sku, gtin, state,
           removed_at, stock_tracked, stock_on_hand)
         VALUES ($1, $2, $3, $4, 5, 6, $5, $6, $7, CASE WHEN $7 = 'removed' THEN now() END, $8, $9) RETURNING id`,
        [p.rows[0]!.id, opts.shop ?? SHOP, value, i, s.sku ?? null, s.gtin ?? null, s.state ?? "active", s.onHand !== undefined && s.onHand !== null, s.onHand ?? null],
      );
      ids.push(v.rows[0]!.id);
    }
    return ids;
  }

  it("lists every size of live and unavailable products — never a draft, an archived product or a removed size", async () => {
    await product("Milk", [{ sku: "M-1" }, { sku: "M-2", state: "inactive" }, { sku: "M-3", state: "removed" }]);
    await product("Bread", [{ sku: "B-1" }], { status: "unavailable" });
    await product("Draft cake", [{ sku: "D-1" }], { status: "draft" });
    await product("Old jam", [{ sku: "J-1" }], { status: "archived" });
    await product("Their milk", [{ sku: "T-1" }], { shop: OTHER_SHOP });
    const page = await readAvailability(SHOP, null, "all", 0, 50);
    expect(page.rows.map((r) => r.sku)).toEqual(["B-1", "M-1", "M-2"]);
    expect(page.counts).toEqual({ needsLook: 0, outOfStock: 0, lowStock: 0, offSale: 1, all: 3 });
  });

  it("marks the last size on sale, so its switch can say why it is refused", async () => {
    await product("Milk", [{ sku: "M-1" }, { sku: "M-2", state: "inactive" }]);
    await product("Eggs", [{ sku: "E-1" }, { sku: "E-2" }]);
    const rows = (await readAvailability(SHOP, null, "all", 0, 50)).rows;
    const last = Object.fromEntries(rows.map((r) => [r.sku, r.lastOnSale]));
    expect(last).toEqual({ "E-1": false, "E-2": false, "M-1": true, "M-2": false });
  });

  it("filters to off sale and to out of stock, and searches name, code and exact barcode", async () => {
    await product("Milk", [{ sku: "M-1", onHand: 0 }, { sku: "M-2", state: "inactive", gtin: "9300000000014" }]);
    await product("Eggs", [{ sku: "E-1", onHand: 4 }]);
    expect((await readAvailability(SHOP, null, "off_sale", 0, 50)).rows.map((r) => r.sku)).toEqual(["M-2"]);
    expect((await readAvailability(SHOP, null, "out_of_stock", 0, 50)).rows.map((r) => r.sku)).toEqual(["M-1"]);
    expect((await readAvailability(SHOP, "egg", "all", 0, 50)).rows.map((r) => r.sku)).toEqual(["E-1"]);
    expect((await readAvailability(SHOP, "9300000000014", "all", 0, 50)).rows.map((r) => r.sku)).toEqual(["M-2"]);
    expect((await readAvailability(SHOP, "930000", "all", 0, 50)).rows).toEqual([]);
  });

  it("pages through the filtered list", async () => {
    await product("Milk", [{ sku: "A" }, { sku: "B" }, { sku: "C" }]);
    const first = await readAvailability(SHOP, null, "all", 0, 2);
    expect(first.rows.map((r) => r.sku)).toEqual(["A", "B"]);
    expect(first.hasMore).toBe(true);
    const second = await readAvailability(SHOP, null, "all", 2, 2);
    expect(second.rows.map((r) => r.sku)).toEqual(["C"]);
    expect(second.hasMore).toBe(false);
  });
});
