// Availability (099): every size of this shop's live or unavailable products, with its stock and
// whether it is on sale. Read only — a size goes on or off sale through the variant state route.
import { likePattern, prefixPattern, query, stockState, type Queryable } from "@effy/edge-shared";
import { variantLabelSql } from "@effy/edge-shared/catalog";
import type { AvailabilityFilter, ProductStockDTO } from "@effy/shared-types";

export interface AvailabilityRow {
  productId: string;
  productName: string;
  brand: string | null;
  productStatus: "active" | "unavailable";
  variantId: string;
  label: string | null;
  code: string;
  sku: string | null;
  gtin: string | null;
  onSale: boolean;
  lastOnSale: boolean;
  stock: ProductStockDTO;
  storageKey: string | null;
}

export interface AvailabilityResult {
  /** Every size under the search and the filter, by product name and the sizes' own order. */
  rows: AvailabilityRow[];
  counts: { needsLook: number; outOfStock: number; lowStock: number; offSale: number; all: number };
}

/**
 * The shop's sellable sizes under the search (`$2`, NULL = none). The search matches the product's name
 * and brand, the size, Effy's code, the shop's code, or the barcode exactly.
 */
const SIZES = `
WITH sizes AS (
  SELECT p.id::text AS product_id,
         p.name AS product_name,
         p.brand,
         p.status AS product_status,
         v.id::text AS variant_id,
         ${variantLabelSql("v")} AS label,
         v.code,
         v.sku,
         v.gtin,
         v.state,
         v.stock_tracked,
         v.stock_on_hand,
         v.low_stock_threshold,
         v."position",
         ss.default_low_stock_threshold AS shop_default_threshold,
         COUNT(*) FILTER (WHERE v.state = 'active') OVER (PARTITION BY p.id) AS active_sizes,
         (SELECT m.storage_key FROM public.product_media m
           WHERE m.product_id = p.id AND (m.id = v.media_id OR m.is_primary)
           ORDER BY (m.id = v.media_id) DESC, m.is_primary DESC
           LIMIT 1) AS storage_key
    FROM public.product p
    JOIN public.product_variant v ON v.product_id = p.id AND v.shop_id = p.shop_id
    LEFT JOIN public.shop_stock_settings ss ON ss.shop_id = p.shop_id
   WHERE p.shop_id = $1::uuid
     AND p.status IN ('active', 'unavailable')
     AND v.state <> 'removed'
)
SELECT *
  FROM sizes
 WHERE $2::text IS NULL
    OR product_name ILIKE $3
    OR brand ILIKE $3
    OR label ILIKE $3
    OR code ILIKE $4
    OR sku ILIKE $3
    OR gtin = $2
 ORDER BY lower(product_name), product_id, "position", variant_id
`;

interface SizeDbRow {
  product_id: string;
  product_name: string;
  brand: string | null;
  product_status: "active" | "unavailable";
  variant_id: string;
  label: string | null;
  code: string;
  sku: string | null;
  gtin: string | null;
  state: "active" | "inactive";
  stock_tracked: boolean;
  stock_on_hand: number | null;
  low_stock_threshold: number | null;
  shop_default_threshold: number | null;
  active_sizes: string;
  storage_key: string | null;
}

function toRow(r: SizeDbRow): AvailabilityRow {
  const onSale = r.state === "active";
  return {
    productId: r.product_id,
    productName: r.product_name,
    brand: r.brand,
    productStatus: r.product_status,
    variantId: r.variant_id,
    label: r.label,
    code: r.code,
    sku: r.sku,
    gtin: r.gtin,
    onSale,
    lastOnSale: onSale && Number(r.active_sizes) <= 1,
    stock: stockState({
      productId: r.product_id,
      variantId: r.variant_id,
      tracked: r.stock_tracked,
      onHand: r.stock_on_hand,
      threshold: r.low_stock_threshold,
      shopDefaultThreshold: r.shop_default_threshold,
    }),
    storageKey: r.storage_key,
  };
}

function matches(row: AvailabilityRow, filter: AvailabilityFilter): boolean {
  switch (filter) {
    case "needs_look":
      return row.stock.outOfStock || row.stock.low;
    case "out_of_stock":
      return row.stock.outOfStock;
    case "low_stock":
      return row.stock.low;
    case "off_sale":
      return !row.onSale;
    case "all":
      return true;
  }
}

/**
 * Every size under the search and filter. A shop sells hundreds of sizes, not millions, so the search
 * runs in SQL and the filter and counts over its result (the user's wildcards taken literally).
 */
export async function readAvailability(
  shopId: string,
  q: string | null,
  filter: AvailabilityFilter,
  db: Queryable = { query },
): Promise<AvailabilityResult> {
  const res = await db.query<SizeDbRow>(SIZES, [shopId, q, q ? likePattern(q) : null, q ? prefixPattern(q) : null]);
  const all = res.rows.map(toRow);
  return {
    rows: all.filter((r) => matches(r, filter)),
    counts: {
      needsLook: all.filter((r) => matches(r, "needs_look")).length,
      outOfStock: all.filter((r) => matches(r, "out_of_stock")).length,
      lowStock: all.filter((r) => matches(r, "low_stock")).length,
      offSale: all.filter((r) => matches(r, "off_sale")).length,
      all: all.length,
    },
  };
}
