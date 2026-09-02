import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}));

import { getProductDetail } from "./repository";

const RUN = process.env.CONTAINER_TESTS === "1";

/**
 * 057 — the product detail read, against real PostgreSQL and the real migrations.
 *
 * ⚠ WHY THIS TEST EXISTS AT ALL. The detail read gained a LEFT JOIN onto `public.supplier` and two
 * selected columns, and that is precisely the change class that TYPECHECKS PERFECTLY AND FAILS ONLY
 * AT RUNTIME. 056 shipped exactly this twice in one slice — `order.reference` for `order_number`,
 * `customer_address.suburb` for `city` — both invisible to `tsc` and to every mocked test, because a
 * mocked repository agrees with the code rather than with the database.
 *
 * ⚠ AND THE JOIN DIRECTION IS THE WHOLE RISK. `product.supplier_id` is nullable by design — 057's
 * own migration says "NULL is expected and supported" — so an INNER join would make every product
 * nobody has assigned a supplier to disappear from its own detail screen: a 404 for a row that
 * exists, on most of the catalogue, on the day this ships. Nothing but a real query can prove which
 * join was written.
 */
function applyMigrations(): string {
  const dir = resolve(import.meta.dirname, "../../../../../db/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
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

const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER_SHOP = "77777777-7777-4777-8777-777777777777";
const SUPPLIER = "88888888-8888-4888-8888-888888888888";
const ASSIGNED = "66666666-6666-4666-8666-666666666666";
const UNASSIGNED = "99999999-9999-4999-8999-999999999999";

describe.skipIf(!RUN)("product detail — against real PostgreSQL and the real migrations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(applyMigrations());
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE public.shop, public.product_type, public.category RESTART IDENTITY CASCADE`,
    );
    await pool.query(
      `INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'),($2,'S2','Shop Two')`,
      [SHOP, OTHER_SHOP],
    );
    await pool.query(
      `INSERT INTO public.product_type (id, key, name) VALUES (gen_random_uuid(),'grocery','Grocery')`,
    );
    await pool.query(
      `INSERT INTO public.category (id, key, name) VALUES (gen_random_uuid(),'pantry','Pantry')`,
    );
    await pool.query(`INSERT INTO public.supplier (id, shop_id, name) VALUES ($1,$2,'Riverina Produce')`, [
      SUPPLIER,
      SHOP,
    ]);
    for (const [id, name, supplier] of [
      [ASSIGNED, "Barossa Free-Range Eggs 700g", SUPPLIER],
      [UNASSIGNED, "Golden Circle Pineapple Juice 2L", null],
    ] as const) {
      await pool.query(
        `INSERT INTO public.product (id, shop_id, product_type_id, primary_category_id, name,
           price_amount, short_description, created_by, supplier_id)
         SELECT $1,$2,pt.id,c.id,$3,10,'x','seed',$4
           FROM public.product_type pt, public.category c
          WHERE pt.key='grocery' AND c.key='pantry'`,
        [id, SHOP, name, supplier],
      );
    }
  });

  it("resolves the supplier's name for a product that has one", async () => {
    const detail = await getProductDetail(SHOP, ASSIGNED);
    expect(detail).not.toBeNull();
    expect(detail!.supplierId).toBe(SUPPLIER);
    expect(detail!.supplierName).toBe("Riverina Produce");
  });

  /**
   * ⚠ THE ONE THAT WOULD HAVE CAUGHT AN INNER JOIN. Every product in the catalogue is unassigned on
   * the day 057 ships, so an inner join would 404 the entire catalogue and pass every mocked test.
   */
  it("still returns a product that has no supplier, with both fields null", async () => {
    const detail = await getProductDetail(SHOP, UNASSIGNED);
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe("Golden Circle Pineapple Juice 2L");
    expect(detail!.supplierId).toBeNull();
    expect(detail!.supplierName).toBeNull();
  });

  it("still refuses another shop's product (the join must not weaken the scope)", async () => {
    // ⚠ Adding a join to a shop-scoped read is a chance to lose the scope. `shop_id` is still the
    // predicate and a foreign shop still gets nothing — which the service turns into a 404.
    expect(await getProductDetail(OTHER_SHOP, ASSIGNED)).toBeNull();
  });

  it("clearing the supplier leaves the product readable rather than orphaning it", async () => {
    await pool.query(`UPDATE public.product SET supplier_id = NULL WHERE id = $1`, [ASSIGNED]);
    const detail = await getProductDetail(SHOP, ASSIGNED);
    expect(detail!.supplierName).toBeNull();
  });

  /**
   * ⚠ `ON DELETE SET NULL`, and the product survives it. The migration chose that over RESTRICT
   * because "losing a supplier must never take the product with it" — this is that promise, executed.
   */
  it("survives the supplier being deleted out from under it", async () => {
    await pool.query(`DELETE FROM public.supplier WHERE id = $1`, [SUPPLIER]);
    const detail = await getProductDetail(SHOP, ASSIGNED);
    expect(detail).not.toBeNull();
    expect(detail!.supplierId).toBeNull();
    expect(detail!.supplierName).toBeNull();
  });
});
