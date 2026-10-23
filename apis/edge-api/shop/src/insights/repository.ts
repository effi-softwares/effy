// Rollups only: nothing here may name `public."order"` or `public.order_item`
// (`rollup-only.guard.test.ts`), so the screen costs a bounded indexed scan (at most 1,440 hour rows).
// No cache: there is nothing the planner does not already do better.
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

/** Name, SKU and image are joined at read time, so a renamed product shows its current name. */
const SELECT_TOP_PRODUCTS = `
SELECT p.id::text AS product_id,
       p.name,
       -- Sales stay per PRODUCT; a stock code is shown only when it has one variant.
       (SELECT CASE WHEN count(*) = 1 THEN min(v.sku) END FROM public.product_variant v
         WHERE v.product_id = p.id AND v.state <> 'removed') AS sku,
       -- is_primary, then display_order.
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
 GROUP BY p.id, p.name
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

/** Short-lived signed URLs, as the catalog serves thumbnails. */
export async function signThumbnails(rows: TopProductRow[]): Promise<(string | null)[]> {
  return Promise.all(rows.map((r) => (r.imageKey ? presignRead(r.imageKey) : Promise.resolve(null))));
}

/** Null means the rollups have never run for this shop: "not looked yet", not "no sales". */
export async function readComputedAt(shopId: string): Promise<Date | null> {
  const res = await query<{ computed_at: Date }>(
    `SELECT computed_at FROM public.insights_state WHERE shop_id = $1::uuid`,
    [shopId],
  );
  return res.rows[0]?.computed_at ?? null;
}
