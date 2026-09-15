// Insights' reads — ROLLUPS ONLY (058, FR-026).
//
// ⚠ NOTHING IN THIS FILE MAY NAME `public."order"` OR `public.order_item`, and a guard enforces it
// (`rollup-only.guard.test.ts`). The rule is not stylistic: the whole promise of this screen is that
// opening it costs a bounded indexed scan rather than an aggregate over the shop's entire history,
// and the way that promise dies is one innocent join added "just to get this one number".
//
// The bounds are small and knowable: at most 1,440 hour rows for a 30-day range plus its comparison
// window, and one product-day aggregate. That is why no cache sits in front of this (architecture
// doc §1.4) — there is nothing here worth caching that the query planner does not already do better.
import { presignRead, query } from "@effy/edge-shared";

export interface HourTotals {
  grossGoods: string;
  refunds: string;
  refundedOrders: number;
  orders: number;
  units: number;
  cantSupply: number;
  cantSupplyUnits: number;
  cancelled: number;
}

export interface HourRow extends HourTotals {
  bucketStart: Date;
}

const SELECT_HOURS = `
SELECT bucket_start, gross_goods, refunds, refunded_orders, orders, units,
       cant_supply, cant_supply_units, cancelled
  FROM public.shop_sales_hour
 WHERE shop_id = $1::uuid
   AND bucket_start >= $2
   AND bucket_start < $3
 ORDER BY bucket_start
`;

interface HourDbRow {
  bucket_start: Date;
  gross_goods: string;
  refunds: string;
  refunded_orders: number;
  orders: number;
  units: number;
  cant_supply: number;
  cant_supply_units: number;
  cancelled: number;
}

export async function readHours(shopId: string, from: Date, to: Date): Promise<HourRow[]> {
  const res = await query<HourDbRow>(SELECT_HOURS, [shopId, from, to]);
  return res.rows.map((r) => ({
    bucketStart: r.bucket_start,
    grossGoods: r.gross_goods,
    refunds: r.refunds,
    refundedOrders: r.refunded_orders,
    orders: r.orders,
    units: r.units,
    cantSupply: r.cant_supply,
    cantSupplyUnits: r.cant_supply_units,
    cancelled: r.cancelled,
  }));
}

export interface TopProductRow {
  productId: string;
  name: string;
  sku: string | null;
  imageKey: string | null;
  units: number;
  revenue: string;
}

/**
 * Top products by goods sold in the window.
 *
 * ⚠ Name, SKU and image are joined from `public.product` at read time rather than copied into the
 * rollup. A renamed product then shows its current name — a copy would leave the operator looking
 * for something that no longer exists under that name anywhere else in the console.
 */
const SELECT_TOP_PRODUCTS = `
SELECT p.id::text AS product_id,
       p.name,
       p.sku,
       -- is_primary then display_order, read off 20260716092105_product_catalog.sql. The first draft
       -- ordered by a "position" column that does not exist: it typechecks perfectly and fails only
       -- at runtime, which is 056's two-wrong-column-names defect exactly.
       (SELECT m.storage_key
          FROM public.product_media m
         WHERE m.product_id = p.id
         ORDER BY m.is_primary DESC, m.display_order, m.created_at
         LIMIT 1) AS image_key,
       SUM(d.units)::int AS units,
       SUM(d.gross_goods)::text AS revenue
  FROM public.shop_product_sales_day d
  JOIN public.product p ON p.id = d.product_id
 WHERE d.shop_id = $1::uuid
   AND d.local_date >= $2::date
   AND d.local_date <= $3::date
 GROUP BY p.id, p.name, p.sku
 ORDER BY SUM(d.gross_goods) DESC, p.name
 LIMIT $4
`;

export async function readTopProducts(
  shopId: string,
  fromDate: string,
  toDate: string,
  limit: number,
): Promise<TopProductRow[]> {
  const res = await query<{
    product_id: string;
    name: string;
    sku: string | null;
    image_key: string | null;
    units: number;
    revenue: string;
  }>(SELECT_TOP_PRODUCTS, [shopId, fromDate, toDate, limit]);

  return res.rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    sku: r.sku,
    imageKey: r.image_key,
    units: r.units,
    revenue: r.revenue,
  }));
}

/** Short-lived signed URLs, exactly as the catalog serves its own thumbnails. */
export async function signThumbnails(rows: TopProductRow[]): Promise<(string | null)[]> {
  return Promise.all(rows.map((r) => (r.imageKey ? presignRead(r.imageKey) : Promise.resolve(null))));
}

/**
 * When this shop's figures were last recomputed.
 *
 * ⚠ NULL IS A REAL ANSWER — the rollups have never run for this shop — and the screen says so rather
 * than showing zeros as though they had been measured. "No sales yet" and "we have not looked yet"
 * are different facts, and only one of them should make an operator worry.
 */
export async function readComputedAt(shopId: string): Promise<Date | null> {
  const res = await query<{ computed_at: Date }>(
    `SELECT computed_at FROM public.insights_state WHERE shop_id = $1::uuid`,
    [shopId],
  );
  return res.rows[0]?.computed_at ?? null;
}
