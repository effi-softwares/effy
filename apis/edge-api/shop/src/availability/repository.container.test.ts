import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { insertTestOption, migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Availability (099) against the real migrations: which sizes are listed, searched, filtered and guarded. */

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]) };
});

import { parseListQuery } from "@effy/edge-shared";

import { AVAILABILITY_LIST_SPEC } from "./list";
import { readAvailability } from "./repository";
import { listAvailability } from "./service";

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
    await pool.query(`TRUNCATE public.shop, public.category RESTART IDENTITY CASCADE`);
    await pool.query(`INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'), ($2,'S2','Shop Two')`, [SHOP, OTHER_SHOP]);
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
      `INSERT INTO public.product (shop_id, primary_category_id, storage, gst_status, age_restricted, name, short_description, created_by, status, approved_at)
       SELECT $1, c.id, 'ambient', 'gst_free', false, $2, 'x', 'seed', $3, CASE WHEN $3 = 'draft' THEN NULL ELSE now() END
         FROM (SELECT id FROM public.category ORDER BY created_at, id LIMIT 1) c RETURNING id`,
      [opts.shop ?? SHOP, name, status],
    );
    // One size: no options. Several: a "Size" option with one value per size, as the editor writes them.
    const values = sizes.length > 1 ? await insertTestOption(pool, p.rows[0]!.id, sizes.map((_, i) => `Size ${i + 1}`)) : null;
    const ids: string[] = [];
    for (const [i, s] of sizes.entries()) {
      const value = values ? values[i]! : null;
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
    const page = await readAvailability(SHOP, null, "all");
    expect(page.rows.map((r) => r.sku)).toEqual(["B-1", "M-1", "M-2"]);
    expect(page.counts).toEqual({ needsLook: 0, outOfStock: 0, lowStock: 0, offSale: 1, all: 3 });
  });

  it("marks the last size on sale, so its switch can say why it is refused", async () => {
    await product("Milk", [{ sku: "M-1" }, { sku: "M-2", state: "inactive" }]);
    await product("Eggs", [{ sku: "E-1" }, { sku: "E-2" }]);
    const rows = (await readAvailability(SHOP, null, "all")).rows;
    const last = Object.fromEntries(rows.map((r) => [r.sku, r.lastOnSale]));
    expect(last).toEqual({ "E-1": false, "E-2": false, "M-1": true, "M-2": false });
  });

  it("filters to off sale and to out of stock, and searches name, code and exact barcode", async () => {
    await product("Milk", [{ sku: "M-1", onHand: 0 }, { sku: "M-2", state: "inactive", gtin: "9300000000014" }]);
    await product("Eggs", [{ sku: "E-1", onHand: 4 }]);
    expect((await readAvailability(SHOP, null, "off_sale")).rows.map((r) => r.sku)).toEqual(["M-2"]);
    expect((await readAvailability(SHOP, null, "out_of_stock")).rows.map((r) => r.sku)).toEqual(["M-1"]);
    expect((await readAvailability(SHOP, "egg", "all")).rows.map((r) => r.sku)).toEqual(["E-1"]);
    expect((await readAvailability(SHOP, "9300000000014", "all")).rows.map((r) => r.sku)).toEqual(["M-2"]);
    expect((await readAvailability(SHOP, "930000", "all")).rows).toEqual([]);
  });

  it("103: pages through the filtered list with an exact total, and answers a page past the end with the last", async () => {
    const skus = Array.from({ length: 27 }, (_, i) => ({ sku: `S${String(i).padStart(2, "0")}` }));
    await product("Milk", skus);
    const list = (qs: Record<string, string>) => listAvailability({ shopId: SHOP }, parseListQuery({ filter: "all", ...qs }, AVAILABILITY_LIST_SPEC));
    const first = await list({});
    expect(first).toMatchObject({ total: 27, page: 1 });
    expect(first.rows).toHaveLength(25);
    const second = await list({ page: "2" });
    expect(second.rows.map((r) => r.sku)).toEqual(["S25", "S26"]);
    expect((await list({ page: "9" })).page).toBe(2);
  });
});
