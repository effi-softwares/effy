// Container-test fixtures for the catalogue: a product is not buyable without a variant, so both are
// written here once, the way the one writer would. Test-only.

import { refreshListing } from "../catalog/listing";
import type { Queryable } from "../lib/db";

export interface TestProductInput {
  shopId: string;
  /** A leaf: `testLeafId` finds one of the seeded taxonomy's. */
  primaryCategoryId: string;
  name: string;
  /** The customer price (the variant's price_amount). */
  price: string;
  /** The shop's price; defaults to `price` (no margin). */
  shopPrice?: string;
  compareAt?: string | null;
  status?: "draft" | "active" | "unavailable" | "archived";
  /** Default true for an active product (only an approved product is active). */
  approved?: boolean;
  brand?: string | null;
  shortDescription?: string;
  gstStatus?: "taxable" | "gst_free";
  storage?: "frozen" | "chilled" | "ambient";
  ageRestricted?: boolean;
  tracked?: boolean;
  onHand?: number | null;
  lowStockThreshold?: number | null;
  weightGrams?: number;
  sku?: string | null;
  gtin?: string | null;
  createdBy?: string;
}

export interface TestProduct {
  productId: string;
  variantId: string;
}

/** A leaf of the seeded taxonomy (the migrations seed it), by key; any leaf when no key is given. */
export async function testLeafId(db: Queryable, key?: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `SELECT c.id::text FROM public.category c JOIN public.category_resolved r ON r.category_id = c.id
      WHERE r.is_leaf AND ($1::text IS NULL OR c.key = $1) ORDER BY c.key LIMIT 1`,
    [key ?? null],
  );
  if (!r.rows[0]) throw new Error(`no seeded leaf ${key ?? ""}`);
  return r.rows[0].id;
}

/** A product with exactly one (option-less) variant, its listing summary refreshed. */
export async function insertTestProduct(db: Queryable, p: TestProductInput): Promise<TestProduct> {
  const status = p.status ?? "active";
  const approved = p.approved ?? status === "active";
  const product = await db.query<{ id: string }>(
    `INSERT INTO public.product
         (shop_id, primary_category_id, name, brand, short_description, created_by,
          status, approved_at, gst_status, storage, age_restricted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::boolean THEN now() END, $9, $10, $11)
     RETURNING id::text`,
    [
      p.shopId, p.primaryCategoryId, p.name, p.brand ?? null, p.shortDescription ?? "d",
      p.createdBy ?? "seed", status, approved, p.gstStatus ?? "gst_free", p.storage ?? "ambient", p.ageRestricted ?? false,
    ],
  );
  const productId = product.rows[0]!.id;
  const variantId = await insertTestVariant(db, productId, p);
  return { productId, variantId };
}

/** Another variant on an existing product (no option values — pass `optionValueIds` for a real set). */
export async function insertTestVariant(
  db: Queryable,
  productId: string,
  p: Omit<TestProductInput, "primaryCategoryId" | "name" | "status" | "approved" | "brand" | "shortDescription" | "gstStatus" | "storage" | "ageRestricted" | "createdBy"> & {
    optionValueIds?: [string | null, string | null];
    position?: number;
    state?: "active" | "inactive" | "removed";
  },
): Promise<string> {
  const tracked = p.tracked ?? false;
  const variant = await db.query<{ id: string }>(
    `INSERT INTO public.product_variant
         (product_id, shop_id, option1_value_id, option2_value_id, position, sku, gtin,
          shop_price_amount, shop_compare_at_amount, price_amount, compare_at_amount,
          weight_grams, weight_is_assumed, stock_tracked, stock_on_hand, low_stock_threshold,
          state, removed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::numeric, $10::numeric, $11::numeric,
             $12, $13, $14, $15, $16, $17, CASE WHEN $17 = 'removed' THEN now() END)
     RETURNING id::text`,
    [
      productId, p.shopId, p.optionValueIds?.[0] ?? null, p.optionValueIds?.[1] ?? null, p.position ?? 0,
      p.sku ?? null, p.gtin ?? null, p.shopPrice ?? p.price, p.compareAt ?? null, p.price, p.compareAt ?? null,
      p.weightGrams ?? 500, p.weightGrams === undefined, tracked, tracked ? (p.onHand ?? 0) : (p.onHand ?? null),
      p.lowStockThreshold ?? null, p.state ?? "active",
    ],
  );
  await refreshListing(db, productId);
  return variant.rows[0]!.id;
}

/**
 * A variant option on a product, as the one writer makes them (105): it names a library attribute — here a
 * test-only "Test option" attribute, made once — and each value names one of its values, labelled as given
 * ("500 g", "1 kg"). Returns the option value ids in order. Test-only: the option is not checked against the
 * product's category.
 */
export async function insertTestOption(db: Queryable, productId: string, labels: readonly string[], position: 1 | 2 = 1): Promise<string[]> {
  const attr = (await db.query<{ id: string }>(
    `WITH made AS (
       INSERT INTO public.attribute_definition (key, name, input_type, varies_by_variant, variant_option)
       VALUES ('test_option', 'Test option', 'single_select', true, true)
       ON CONFLICT (key) DO NOTHING RETURNING id)
     SELECT id::text FROM made UNION ALL SELECT id::text FROM public.attribute_definition WHERE key = 'test_option' LIMIT 1`,
  )).rows[0]!.id;
  const option = (await db.query<{ id: string }>(
    `INSERT INTO public.product_option (product_id, "position", attribute_id) VALUES ($1, $2, $3) RETURNING id::text`,
    [productId, position, attr],
  )).rows[0]!.id;
  const ids: string[] = [];
  for (const [i, label] of labels.entries()) {
    const allowed = (await db.query<{ id: string }>(
      `WITH made AS (
         INSERT INTO public.attribute_allowed_value (attribute_definition_id, label, "position") VALUES ($1, $2, 0)
         ON CONFLICT (attribute_definition_id, lower(label)) DO NOTHING RETURNING id)
       SELECT id::text FROM made
       UNION ALL SELECT id::text FROM public.attribute_allowed_value WHERE attribute_definition_id = $1 AND lower(label) = lower($2)
       LIMIT 1`,
      [attr, label],
    )).rows[0]!.id;
    ids.push((await db.query<{ id: string }>(
      `INSERT INTO public.product_option_value (option_id, value, "position", allowed_value_id) VALUES ($1, $2, $3, $4) RETURNING id::text`,
      [option, label, i, allowed],
    )).rows[0]!.id);
  }
  return ids;
}
