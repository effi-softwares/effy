import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  const q = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return { ...actual, publicImageUrl: () => null, query: q, pooled: { query: q } };
});

import { migrationSql, testLeafId } from "@effy/edge-shared/testing";

import { list } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let department: string;

const PRODUCTS = 50_000;

/** Wall time of one list call, the counts included (SC-002: under a second at 50 000 products). */
async function timed(params: Record<string, string>): Promise<number> {
  const t = performance.now();
  await list(params);
  return performance.now() - t;
}

d("102 — the list at 50 000 products (SC-002)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    const leaf = await testLeafId(pool);
    department = (await pool.query<{ id: string }>(
      `SELECT ca.ancestor_id::text AS id FROM public.category_ancestor ca JOIN public.category c ON c.id = ca.ancestor_id
        WHERE ca.category_id = $1 AND c.parent_id IS NULL`, [leaf],
    )).rows[0]!.id;
    const leaves = (await pool.query<{ id: string }>(
      `SELECT category_id::text AS id FROM public.category_resolved WHERE is_leaf ORDER BY category_id LIMIT 50`,
    )).rows.map((r) => r.id);
    await pool.query(
      `INSERT INTO public.shop (code, name) SELECT 'S' || lpad(g::text, 3, '0'), 'Shop ' || g FROM generate_series(1, 40) g`,
    );
    await pool.query(
      `INSERT INTO public.product (shop_id, primary_category_id, name, brand, short_description, created_by,
                                   status, approved_at, gst_status, storage, age_restricted, list_price_amount)
       SELECT (SELECT id FROM public.shop ORDER BY code OFFSET (g % 40) LIMIT 1),
              ($1::uuid[])[1 + (g % array_length($1::uuid[], 1))],
              'Product ' || g, 'Brand ' || (g % 300), 'Something to eat number ' || g, 'seed',
              'active', now(), 'gst_free', 'ambient', false, (g % 50) + 1
         FROM generate_series(1, ${PRODUCTS}) g`,
      [leaves],
    );
    await pool.query(
      `INSERT INTO public.product_variant (product_id, shop_id, sku, gtin, shop_price_amount, price_amount)
       SELECT p.id, p.shop_id, 'SKU-' || row_number() OVER (), NULL, p.list_price_amount, p.list_price_amount
         FROM public.product p`,
    );
    await pool.query("ANALYZE");
  }, 600_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it.each([
    ["the default view", {}],
    ["a name search", { q: "number 4242" }],
    ["a SKU search", { q: "sku-31337" }],
    ["an aisle", { categoryId: "" }],
    ["sorted by price", { sort: "price", dir: "asc" }],
    ["the held tab", { state: "held" }],
  ])("%s answers in under a second", async (_label, params: Record<string, string>) => {
    const p = "categoryId" in params ? { categoryId: department } : params;
    await timed(p); // warm
    expect(await timed(p)).toBeLessThan(1000);
  });
});
