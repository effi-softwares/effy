import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DetailInput, OptionInputDTO, VariantInputDTO } from "@effy/shared-types";

import { transactorFor, type Queryable } from "../lib/db";
import { migrationSql } from "../testing/migrations";
import { DetailsInvalid, readProductDetails, reconcileDetails, writeProductDetails } from "./details";
import { missingRequired } from "./form";
import { applyVariantSet } from "./variants";

/** The one writer of product details (101) against the real migrations and the seeded taxonomy. */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let tx: <T>(fn: (q: Queryable) => Promise<T>) => Promise<T>;
let shopId: string;
const ids: Record<string, string> = {};

const uuid = () => crypto.randomUUID();

async function leaf(key: string): Promise<string> {
  return (await pool.query<{ id: string }>(`SELECT id::text FROM public.category WHERE key = $1`, [key])).rows[0]!.id;
}
async function attr(key: string): Promise<string> {
  return (await pool.query<{ id: string }>(`SELECT id::text FROM public.attribute_definition WHERE key = $1`, [key])).rows[0]!.id;
}
async function value(attrKey: string, label: string): Promise<string> {
  return (await pool.query<{ id: string }>(
    `SELECT v.id::text FROM public.attribute_allowed_value v JOIN public.attribute_definition ad ON ad.id = v.attribute_definition_id
      WHERE ad.key = $1 AND v.label = $2`, [attrKey, label],
  )).rows[0]!.id;
}

async function product(leafKey: string): Promise<string> {
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.product (shop_id, primary_category_id, name, short_description, created_by, gst_status, storage, age_restricted)
     VALUES ($1, $2, 'P', 'd', 'seed', 'gst_free', 'ambient', false) RETURNING id::text`,
    [shopId, await leaf(leafKey)],
  )).rows[0]!.id;
}

const variant = (position: number, valueIds: [string | null, string | null], extra: Partial<VariantInputDTO> = {}): VariantInputDTO => ({
  id: uuid(), position, optionValueIds: valueIds, shopPriceAmount: "4.00", ...extra,
});

/** Two pack sizes (500 g, 1 kg), or with `flavour`, two flavours (Plain, Mango). */
async function twoVariants(productId: string, kind: "pack" | "flavour"): Promise<string[]> {
  const a = uuid();
  const b = uuid();
  const option: OptionInputDTO = kind === "pack"
    ? { id: uuid(), position: 1, kind: "pack_size", values: [{ id: a, position: 0 }, { id: b, position: 1 }] }
    : {
        id: uuid(), position: 1, kind: "attribute", attributeId: ids.flavour!,
        values: [{ id: a, allowedValueId: ids.plain!, position: 0 }, { id: b, allowedValueId: ids.mango!, position: 1 }],
      };
  const vs = kind === "pack"
    ? [variant(0, [a, null], { packQuantity: "500", packUnit: "g" }), variant(1, [b, null], { packQuantity: "1", packUnit: "kg" })]
    : [variant(0, [a, null]), variant(1, [b, null])];
  await tx((q) => applyVariantSet(q, { productId, shopId, options: [option], variants: vs, mode: "draft" }));
  return vs.map((v) => v.id);
}

const stored = async (productId: string) =>
  (await pool.query<{ key: string; variant_id: string | null; value_number: string | null; value_unit: string | null; value_base: string | null }>(
    `SELECT ad.key, pav.variant_id::text, pav.value_number::text, pav.value_unit, pav.value_base::text
       FROM public.product_attribute_value pav JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
      WHERE pav.product_id = $1 ORDER BY ad.key, pav.variant_id NULLS FIRST`,
    [productId],
  )).rows;

const refusal = async (p: Promise<unknown>): Promise<string[]> => {
  try {
    await p;
    return [];
  } catch (e) {
    if (e instanceof DetailsInvalid) return e.errors.map((x) => x.field);
    throw e;
  }
};

d("101 — product details: the one writer", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    tx = transactorFor(pool);
    await pool.query(migrationSql());
    for (const k of ["allergens", "ingredients", "country_of_origin", "flavour", "weight"]) ids[k] = await attr(k);
    ids.milk = await value("allergens", "Milk");
    ids.eggs = await value("allergens", "Eggs");
    ids.plain = await value("flavour", "Plain");
    ids.mango = await value("flavour", "Mango");
    ids.australia = await value("country_of_origin", "Australia");
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    shopId = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id::text`, [`S${uuid().slice(0, 6)}`])).rows[0]!.id;
  });

  it("keeps a number as entered and in its base unit, and refuses a unit outside the attribute's list", async () => {
    const p = await product("weights-and-dumbbells");
    await tx((q) => applyVariantSet(q, { productId: p, shopId, options: [], variants: [variant(0, [null, null])], mode: "draft" }));
    await tx((q) => writeProductDetails(q, p, [{ attributeId: ids.weight!, value: { number: "1.5", unit: "kg" } }]));
    expect(await stored(p)).toEqual([{ key: "weight", variant_id: null, value_number: "1.5", value_unit: "kg", value_base: "1500" }]);
    expect((await readProductDetails(pool, [p])).get(p)).toEqual([{ attributeId: ids.weight, value: { number: "1.5", unit: "kg" } }]);
    expect(await refusal(tx((q) => writeProductDetails(q, p, [{ attributeId: ids.weight!, value: { number: "2", unit: "mg" } }]))))
      .toEqual(["details.weight"]);
  });

  it("holds a detail per variant or for the whole product, never both, and replaces the set each write", async () => {
    const p = await product("greek-and-natural-yoghurt");
    const [v1, v2] = await twoVariants(p, "pack");
    const per: DetailInput = {
      attributeId: ids.allergens!,
      perVariant: [{ variantId: v1!, value: { valueIds: [ids.milk!] } }, { variantId: v2!, value: { valueIds: [ids.milk!, ids.eggs!] } }],
    };
    await tx((q) => writeProductDetails(q, p, [per]));
    expect((await stored(p)).map((r) => [r.key, r.variant_id])).toEqual([["allergens", v1], ["allergens", v2]].sort((a, b) => String(a[1]).localeCompare(String(b[1]))));
    await tx((q) => writeProductDetails(q, p, [{ attributeId: ids.allergens!, value: { valueIds: [ids.milk!] } }]));
    expect((await stored(p)).map((r) => [r.key, r.variant_id])).toEqual([["allergens", null]]);
    // Country of origin is the same for every variant: it cannot differ.
    expect(await refusal(tx((q) => writeProductDetails(q, p, [{ attributeId: ids.country_of_origin!, perVariant: [{ variantId: v1!, value: { valueIds: [ids.australia!] } }] }]))))
      .toEqual(["details.country_of_origin"]);
  });

  it("writes a variant's option value as its value of that attribute, and refuses it as a detail", async () => {
    const p = await product("greek-and-natural-yoghurt");
    const [v1, v2] = await twoVariants(p, "flavour");
    const rows = await pool.query<{ variant_id: string; ids: string[] }>(
      `SELECT variant_id::text, allowed_value_ids::text[] AS ids FROM public.product_attribute_value WHERE product_id = $1 AND attribute_definition_id = $2 ORDER BY variant_id`,
      [p, ids.flavour],
    );
    expect(new Map(rows.rows.map((r) => [r.variant_id, r.ids[0]]))).toEqual(new Map([[v1!, ids.plain], [v2!, ids.mango]]));
    expect(await refusal(tx((q) => writeProductDetails(q, p, [{ attributeId: ids.flavour!, value: { valueIds: [ids.plain!] } }]))))
      .toEqual(["details.flavour"]);
    // A details write leaves the option-derived values alone.
    await tx((q) => writeProductDetails(q, p, [{ attributeId: ids.country_of_origin!, value: { valueIds: [ids.australia!] } }]));
    expect((await stored(p)).filter((r) => r.key === "flavour")).toHaveLength(2);
    expect((await readProductDetails(pool, [p], { excludeOptions: true })).get(p)!.map((x) => x.attributeId)).toEqual([ids.country_of_origin]);
  });

  it("keeps a value a staff attachment hides on the product's own leaf, and drops it on re-categorising", async () => {
    const p = await product("rice");
    await tx((q) => applyVariantSet(q, { productId: p, shopId, options: [], variants: [variant(0, [null, null])], mode: "draft" }));
    await tx((q) => writeProductDetails(q, p, [{ attributeId: ids.allergens!, value: { valueIds: [ids.milk!] } }]));
    const rice = await leaf("rice");
    await pool.query(`INSERT INTO public.category_attribute (category_id, attribute_id, hidden) VALUES ($1, $2, true)`, [rice, ids.allergens]);
    await pool.query(`SELECT public.rebuild_category_derived()`);
    expect(await tx((q) => reconcileDetails(q, p))).toEqual([]);
    expect((await stored(p)).map((r) => r.key)).toEqual(["allergens"]);

    await pool.query(`DELETE FROM public.category_attribute WHERE category_id = $1 AND attribute_id = $2`, [rice, ids.allergens]);
    await pool.query(`SELECT public.rebuild_category_derived()`);
    expect((await missingRequired(pool, [p])).get(p)).toEqual(["Country of origin"]);

    await pool.query(`UPDATE public.product SET primary_category_id = $2 WHERE id = $1`, [p, await leaf("weights-and-dumbbells")]);
    expect(await tx((q) => reconcileDetails(q, p, { dropHidden: true }))).toEqual(["Allergens"]);
    expect(await stored(p)).toEqual([]);
  });

  it("collapses per-variant values when one variant is left, and names what went", async () => {
    const p = await product("greek-and-natural-yoghurt");
    const [v1, v2] = await twoVariants(p, "pack");
    await tx((q) => writeProductDetails(q, p, [{
      attributeId: ids.allergens!,
      perVariant: [{ variantId: v1!, value: { valueIds: [ids.milk!] } }, { variantId: v2!, value: { valueIds: [ids.eggs!] } }],
    }]));
    const keep = (await pool.query<{ o: string; ov: string }>(
      `SELECT o.id::text AS o, ov.id::text AS ov FROM public.product_option o JOIN public.product_option_value ov ON ov.option_id = o.id
        JOIN public.product_variant v ON v.option1_value_id = ov.id WHERE v.id = $1`, [v1],
    )).rows[0]!;
    const result = await tx((q) => applyVariantSet(q, {
      productId: p, shopId, mode: "draft",
      options: [{ id: keep.o, position: 1, kind: "pack_size", values: [{ id: keep.ov, position: 0 }] }],
      variants: [{ ...variant(0, [keep.ov, null], { packQuantity: "500", packUnit: "g" }), id: v1! }],
    }));
    expect(result.droppedDetails).toEqual(["Allergens"]);
    expect((await readProductDetails(pool, [p])).get(p)).toEqual([{ attributeId: ids.allergens, value: { valueIds: [ids.milk] } }]);
  });
});
