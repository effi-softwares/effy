import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../testing/migrations";
import { insertTestProduct, insertTestVariant } from "../testing/catalog-fixture";

/**
 * public.rebuild_category_derived — the one definition of inheritance (101) — on a small hand-built tree:
 *
 *   T-Dept (allergens optional "Safety" 10, colour optional, storage chilled, gst taxable)
 *   └ T-Aisle (allergens → required, colour hidden, gst gst_free)
 *     ├ T-Leaf-A
 *     └ T-Shelf (colour attached again, recommended)
 *       └ T-Leaf-B (storage frozen, age true)
 */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const id: Record<string, string> = {};

async function category(key: string, name: string, parent: string | null, defaults: { storage?: string; gst?: string; age?: boolean } = {}) {
  id[key] = (await pool.query<{ id: string }>(
    `INSERT INTO public.category (key, name, parent_id, default_storage, default_gst_status, default_age_restricted)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
    [key, name, parent ? id[parent] : null, defaults.storage ?? null, defaults.gst ?? null, defaults.age ?? null],
  )).rows[0]!.id;
}

async function attribute(key: string, name: string, inputType = "short_text", varies = false) {
  id[key] = (await pool.query<{ id: string }>(
    `INSERT INTO public.attribute_definition (key, name, input_type, varies_by_variant) VALUES ($1, $2, $3, $4) RETURNING id::text`,
    [key, name, inputType, varies],
  )).rows[0]!.id;
}

async function attach(cat: string, attr: string, level: string | null, section: string | null = null, position: number | null = null) {
  await pool.query(
    `INSERT INTO public.category_attribute (category_id, attribute_id, level, hidden, section, "position")
     VALUES ($1, $2, $3::text, $3::text IS NULL, $4, $5)`,
    [id[cat], id[attr], level, section, position],
  );
}

const form = async (cat: string) =>
  (await pool.query<{ key: string; level: string; section: string; position: number; source: string }>(
    `SELECT ad.key, f.level, f.section, f."position", src.key AS source
       FROM public.category_form f
       JOIN public.attribute_definition ad ON ad.id = f.attribute_id
       JOIN public.category src ON src.id = f.source_category_id
      WHERE f.category_id = $1 ORDER BY ad.key`,
    [id[cat]],
  )).rows;

const resolved = async (cat: string) =>
  (await pool.query<{ depth: number; is_leaf: boolean; storage: string | null; gst_status: string | null; age_restricted: boolean | null; path_names: string[] }>(
    `SELECT depth, is_leaf, storage, gst_status, age_restricted, path_names FROM public.category_resolved WHERE category_id = $1`,
    [id[cat]],
  )).rows[0];

d("101 — rebuild_category_derived: inheritance, hiding, defaults, the closure", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());

    await category("t-dept", "T-Dept", null, { storage: "chilled", gst: "taxable" });
    await category("t-aisle", "T-Aisle", "t-dept", { gst: "gst_free" });
    await category("t-leaf-a", "T-Leaf-A", "t-aisle");
    await category("t-shelf", "T-Shelf", "t-aisle");
    await category("t-leaf-b", "T-Leaf-B", "t-shelf", { storage: "frozen", age: true });
    await attribute("t_allergens", "T Allergens", "short_text", true);
    await attribute("t_colour", "T Colour");
    await attach("t-dept", "t_allergens", "optional", "Safety", 10);
    await attach("t-dept", "t_colour", "optional");
    await attach("t-aisle", "t_allergens", "required");
    await attach("t-aisle", "t_colour", null);
    await attach("t-shelf", "t_colour", "recommended", "Looks", 5);
    await pool.query(`SELECT public.rebuild_category_derived()`);
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("sets at the department and tightens below, keeping the inherited section and position", async () => {
    expect(await form("t-dept")).toEqual([
      { key: "t_allergens", level: "optional", section: "Safety", position: 10, source: "t-dept" },
      { key: "t_colour", level: "optional", section: "Details", position: 0, source: "t-dept" },
    ]);
    expect(await form("t-leaf-a")).toEqual([
      { key: "t_allergens", level: "required", section: "Safety", position: 10, source: "t-aisle" },
    ]);
  });

  it("hides an attribute for a branch until a deeper category attaches it again", async () => {
    expect((await form("t-aisle")).map((r) => r.key)).toEqual(["t_allergens"]);
    expect(await form("t-leaf-b")).toEqual([
      { key: "t_allergens", level: "required", section: "Safety", position: 10, source: "t-aisle" },
      { key: "t_colour", level: "recommended", section: "Looks", position: 5, source: "t-shelf" },
    ]);
  });

  it("resolves defaults to the nearest category that sets one, with the path and depth", async () => {
    expect(await resolved("t-leaf-a")).toMatchObject({ depth: 3, is_leaf: true, storage: "chilled", gst_status: "gst_free", age_restricted: null });
    expect(await resolved("t-leaf-b")).toMatchObject({
      depth: 4, is_leaf: true, storage: "frozen", gst_status: "gst_free", age_restricted: true,
      path_names: ["T-Dept", "T-Aisle", "T-Shelf", "T-Leaf-B"],
    });
    expect((await resolved("t-shelf"))!.is_leaf).toBe(false);
  });

  it("writes the closure, self included", async () => {
    const r = await pool.query<{ key: string; distance: number }>(
      `SELECT c.key, a.distance FROM public.category_ancestor a JOIN public.category c ON c.id = a.ancestor_id
        WHERE a.category_id = $1 ORDER BY a.distance`,
      [id["t-leaf-b"]],
    );
    expect(r.rows).toEqual([
      { key: "t-leaf-b", distance: 0 }, { key: "t-shelf", distance: 1 }, { key: "t-aisle", distance: 2 }, { key: "t-dept", distance: 3 },
    ]);
  });

  it("ignores a retired attribute, and a retired leaf makes its parent a leaf", async () => {
    await pool.query(`UPDATE public.attribute_definition SET status = 'retired' WHERE id = $1`, [id["t_colour"]]);
    await pool.query(`UPDATE public.category SET status = 'retired' WHERE id = $1`, [id["t-leaf-b"]]);
    await pool.query(`SELECT public.rebuild_category_derived()`);
    expect((await form("t-shelf")).map((r) => r.key)).toEqual(["t_allergens"]);
    expect((await resolved("t-shelf"))!.is_leaf).toBe(true);
    expect(await resolved("t-leaf-b")).toBeUndefined();
    await pool.query(`UPDATE public.attribute_definition SET status = 'active' WHERE id = $1`, [id["t_colour"]]);
    await pool.query(`UPDATE public.category SET status = 'active' WHERE id = $1`, [id["t-leaf-b"]]);
    await pool.query(`SELECT public.rebuild_category_derived()`);
  });

  it("refuses an active category under a retired one, and a sixth level", async () => {
    await pool.query(`UPDATE public.category SET status = 'retired' WHERE id = $1`, [id["t-shelf"]]);
    await expect(pool.query(`SELECT public.rebuild_category_derived()`)).rejects.toThrow(/under a retired one/);
    await pool.query(`UPDATE public.category SET status = 'active' WHERE id = $1`, [id["t-shelf"]]);
    await category("t-5", "T-5", "t-leaf-b");
    await category("t-6", "T-6", "t-5");
    await expect(pool.query(`SELECT public.rebuild_category_derived()`)).rejects.toThrow(/deeper than five/);
    await pool.query(`DELETE FROM public.category WHERE key IN ('t-6', 't-5')`);
    await pool.query(`SELECT public.rebuild_category_derived()`);
  });

  it("product_missing_required: a gap for the whole product, then per active variant once values differ", async () => {
    const shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('T101', 'T') RETURNING id::text`)).rows[0]!.id;
    const { productId, variantId } = await insertTestProduct(pool, { shopId: shop, primaryCategoryId: id["t-leaf-a"]!, name: "P", price: "1.00" });
    const missing = async () =>
      (await pool.query<{ attribute_name: string; variant_id: string | null }>(
        `SELECT attribute_name, variant_id::text FROM public.product_missing_required($1)`, [productId],
      )).rows;
    expect(await missing()).toEqual([{ attribute_name: "T Allergens", variant_id: null }]);

    // Two variants by a library option (Flavour: Plain, Natural).
    const option = (await pool.query<{ id: string }>(
      `INSERT INTO public.product_option (product_id, "position", attribute_id)
       VALUES ($1, 1, (SELECT id FROM public.attribute_definition WHERE key = 'flavour')) RETURNING id::text`, [productId],
    )).rows[0]!.id;
    const values = (await pool.query<{ id: string }>(
      `INSERT INTO public.product_option_value (option_id, value, "position", allowed_value_id)
       SELECT $1, v.label, CASE v.label WHEN 'Plain' THEN 0 ELSE 1 END, v.id
         FROM public.attribute_allowed_value v JOIN public.attribute_definition ad ON ad.id = v.attribute_definition_id
        WHERE ad.key = 'flavour' AND v.label IN ('Plain', 'Natural')
        ORDER BY 3
       RETURNING id::text`, [option],
    )).rows.map((r) => r.id);
    await pool.query(`UPDATE public.product_variant SET option1_value_id = $1 WHERE id = $2`, [values[0], variantId]);
    const second = await insertTestVariant(pool, productId, { shopId: shop, price: "2.00", position: 1, optionValueIds: [values[1]!, null] });
    await pool.query(
      `INSERT INTO public.product_attribute_value (product_id, variant_id, attribute_definition_id, value_text) VALUES ($1, $2, $3, 'milk')`,
      [productId, variantId, id["t_allergens"]],
    );
    expect(await missing()).toEqual([{ attribute_name: "T Allergens", variant_id: second }]);

    await pool.query(
      `INSERT INTO public.product_attribute_value (product_id, variant_id, attribute_definition_id, value_text) VALUES ($1, $2, $3, 'none')`,
      [productId, second, id["t_allergens"]],
    );
    expect(await missing()).toEqual([]);
  });
});
