import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 101 against the real migrations and the seeded taxonomy: a product is filed in a leaf, takes that leaf's
 * facts, is checked against its form, cannot be submitted with a required detail empty, and an approved
 * product's re-categorising is a proposal.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
});
vi.mock("./media", () => ({
  presignRead: async (key: string) => `signed:${key}`,
  presignUpload: async () => ({ uploadUrl: "u", storageKey: "k" }),
}));

import { migrationSql } from "@effy/edge-shared/testing";

import { createProduct, getCategoryForm, getProduct, getShopTaxonomy, registerMedia, submitForReview, updateProduct } from "./service";
import { isProductError } from "./types";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;
const ids: Record<string, string> = {};

const one = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: string }>(sql, args)).rows[0]!.id;
const variant = () => ({ id: randomUUID(), position: 0, optionValueIds: [null, null], shopPriceAmount: "4.50" });
const body = (leaf: string, over: Record<string, unknown> = {}) => ({
  primaryCategoryId: leaf, name: "Thing", shortDescription: "A thing", options: [], variants: [variant()], ...over,
});

async function fieldsOf(p: Promise<unknown>): Promise<string[]> {
  try {
    await p;
    return [];
  } catch (e) {
    if (isProductError(e)) return (e.fields ?? []).map((f) => `${f.field}: ${f.message}`);
    throw e;
  }
}

d("101 — shop products in the category-driven catalogue", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    for (const k of ["greek-and-natural-yoghurt", "dairy-eggs-and-fridge", "laundry-liquid", "red-wine"]) {
      ids[k] = await one(`SELECT id::text FROM public.category WHERE key = $1`, [k]);
    }
    for (const k of ["allergens", "country_of_origin"]) ids[k] = await one(`SELECT id::text FROM public.attribute_definition WHERE key = $1`, [k]);
    ids.milk = await one(`SELECT v.id::text FROM public.attribute_allowed_value v WHERE v.attribute_definition_id = $1 AND v.label = 'Milk'`, [ids.allergens]);
    ids.australia = await one(`SELECT v.id::text FROM public.attribute_allowed_value v WHERE v.attribute_definition_id = $1 AND v.label = 'Australia'`, [ids.country_of_origin]);
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    shopId = await one(`INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id::text`, [`S${randomUUID().slice(0, 6)}`]);
  });

  it("files a product only in a leaf", async () => {
    expect((await fieldsOf(createProduct(shopId, body(ids["dairy-eggs-and-fridge"]!), "sub"))).join()).toContain("category_not_leaf");
    await expect(getCategoryForm(ids["dairy-eggs-and-fridge"]!)).rejects.toMatchObject({ message: "category_not_leaf" });
    const form = await getCategoryForm(ids["greek-and-natural-yoghurt"]!);
    expect(form.isLeaf).toBe(true);
    expect(form.sections.flatMap((s) => s.rows.map((r) => r.key))).toEqual(expect.arrayContaining(["allergens", "country_of_origin"]));
  });

  it("takes storage, GST and 18+ from the leaf unless the shop chooses", async () => {
    const yoghurt = await createProduct(shopId, body(ids["greek-and-natural-yoghurt"]!), "sub");
    expect(yoghurt).toMatchObject({ storage: "chilled", gstStatus: "gst_free", ageRestricted: false });
    const wine = await createProduct(shopId, body(ids["red-wine"]!, { storage: "chilled" }), "sub");
    expect(wine).toMatchObject({ storage: "chilled", gstStatus: "taxable", ageRestricted: true });
  });

  it("checks details against the leaf's form, and refuses to submit while a required one is empty", async () => {
    expect((await fieldsOf(createProduct(shopId, body(ids["greek-and-natural-yoghurt"]!, {
      details: [{ attributeId: ids.allergens, value: { text: "milk" } }],
    }), "sub"))).join()).toContain("details.allergens");

    const draft = await createProduct(shopId, body(ids["greek-and-natural-yoghurt"]!, {
      details: [{ attributeId: ids.allergens, value: { valueIds: [ids.milk] } }],
    }), "sub");
    expect(draft.missingRequired).toEqual(["Country of origin"]);
    await registerMedia(shopId, draft.id, { storageKey: "products/x/a.jpg", isPrimary: true });
    expect((await fieldsOf(submitForReview(shopId, draft.id))).join()).toContain("missing_required_details: Country of origin");

    const fresh = await updateProduct(shopId, draft.id, {
      expectedUpdatedAt: (await getProduct(shopId, draft.id)).updatedAt,
      details: [{ attributeId: ids.allergens, value: { valueIds: [ids.milk] } }, { attributeId: ids.country_of_origin, value: { valueIds: [ids.australia] } }],
    }, "sub");
    expect(fresh.missingRequired).toEqual([]);
    expect((await submitForReview(shopId, draft.id)).reviewState).toBe("in_review");
  });

  it("drops details a new leaf does not ask for, saying which, and re-defaults untouched facts", async () => {
    const draft = await createProduct(shopId, body(ids["greek-and-natural-yoghurt"]!, {
      details: [{ attributeId: ids.allergens, value: { valueIds: [ids.milk] } }],
    }), "sub");
    const moved = await updateProduct(shopId, draft.id, { expectedUpdatedAt: draft.updatedAt, primaryCategoryId: ids["laundry-liquid"] }, "sub");
    expect(moved.details).toEqual([]);
    expect(moved.droppedDetails).toEqual(["Allergens"]);
    expect(moved).toMatchObject({ storage: "ambient", gstStatus: "taxable", categoryPath: ["Household & Cleaning", "Laundry", "Laundry Liquid"] });
  });

  it("an approved product's new category is a proposal; the live row keeps its leaf", async () => {
    const p = await createProduct(shopId, body(ids["laundry-liquid"]!), "sub");
    await pool.query(`UPDATE public.product SET approved_at = now(), status = 'active' WHERE id = $1`, [p.id]);
    const shown = await updateProduct(shopId, p.id, { primaryCategoryId: ids["greek-and-natural-yoghurt"] }, "sub");
    expect(shown.primaryCategoryId).toBe(ids["laundry-liquid"]);
    expect(shown.pendingChange?.proposed).toMatchObject({ primaryCategoryId: ids["greek-and-natural-yoghurt"], storage: "chilled", gstStatus: "gst_free" });
  });

  it("lists every active category and the shop's recent leaves, newest first", async () => {
    await createProduct(shopId, body(ids["laundry-liquid"]!), "sub");
    await createProduct(shopId, body(ids["greek-and-natural-yoghurt"]!), "sub");
    const tax = await getShopTaxonomy(shopId);
    expect(tax.categories.length).toBeGreaterThan(600);
    expect(tax.recentLeafIds.slice(0, 2)).toEqual([ids["greek-and-natural-yoghurt"], ids["laundry-liquid"]]);
    const chargers = tax.categories.find((c) => c.name === "Chargers & Cables")!;
    expect(chargers).toMatchObject({ isLeaf: true, path: ["Electronics", "Phones & Accessories", "Chargers & Cables"], icon: "cable" });
    expect(chargers.synonyms).toContain("charger");
  });
});
