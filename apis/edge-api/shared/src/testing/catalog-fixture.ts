// Container-test fixtures for the catalogue (098). Since 098 a product cannot be bought, priced or
// counted without a variant, so every container test that needs "a product" needs a product AND its
// variant — written here once, the way the one writer would, so no test re-types the shape and drifts.
//
// Test-only: imported from `*.container.test.ts` files, never from service code.

import { refreshListing } from "../catalog/listing";
import type { Queryable } from "../lib/db";

export interface TestProductInput {
  shopId: string;
  productTypeId: string;
  primaryCategoryId: string;
  name: string;
  /** The CUSTOMER price (the variant's price_amount). */
  price: string;
  /** The shop's price; defaults to `price` (no margin). */
  shopPrice?: string;
  compareAt?: string | null;
  status?: "draft" | "active" | "unavailable" | "archived";
  /** Default true for an active product (067: only an approved product is active). */
  approved?: boolean;
  brand?: string | null;
  shortDescription?: string;
  gstStatus?: "taxable" | "gst_free" | null;
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

/** A product with exactly one (option-less) variant, its listing summary refreshed. */
export async function insertTestProduct(db: Queryable, p: TestProductInput): Promise<TestProduct> {
  const status = p.status ?? "active";
  const approved = p.approved ?? status === "active";
  const product = await db.query<{ id: string }>(
    `INSERT INTO public.product
         (shop_id, product_type_id, primary_category_id, name, brand, short_description, created_by,
          status, approved_at, gst_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9::boolean THEN now() END, $10)
     RETURNING id::text`,
    [
      p.shopId, p.productTypeId, p.primaryCategoryId, p.name, p.brand ?? null, p.shortDescription ?? "d",
      p.createdBy ?? "seed", status, approved, p.gstStatus === undefined ? "gst_free" : p.gstStatus,
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
  p: Omit<TestProductInput, "productTypeId" | "primaryCategoryId" | "name" | "status" | "approved" | "brand" | "shortDescription" | "gstStatus" | "createdBy"> & {
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
