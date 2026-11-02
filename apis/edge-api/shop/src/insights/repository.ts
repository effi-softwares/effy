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
  /** 099 quality: portions finished (first ready, or can't supply) in the hour, their units, and time to ready. */
  finishedOrders: number;
  finishedUnitsOrdered: number;
  finishedUnitsSupplied: number;
  readyOrders: number;
  readySeconds: number;
}

export interface HourRow extends HourTotals {
  bucketStart: Date;
  readySpread: number[];
}

const SELECT_HOURS = `
SELECT bucket_start, gross_goods, refunds, refunded_orders, orders, units,
       cant_supply, cant_supply_units, cancelled,
       finished_orders, finished_units_ordered, finished_units_supplied, ready_orders, ready_seconds, ready_spread
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
  finished_orders: number;
  finished_units_ordered: number;
  finished_units_supplied: number;
  ready_orders: number;
  /** bigint arrives as a string. */
  ready_seconds: string;
  ready_spread: number[];
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
    finishedOrders: r.finished_orders,
    finishedUnitsOrdered: r.finished_units_ordered,
    finishedUnitsSupplied: r.finished_units_supplied,
    readyOrders: r.ready_orders,
    readySeconds: Number(r.ready_seconds),
    readySpread: r.ready_spread,
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

/** Every product's place in a window, the same order as `SELECT_TOP_PRODUCTS`. */
const SELECT_PRODUCT_RANKS = `
SELECT d.product_id::text AS product_id,
       RANK() OVER (ORDER BY SUM(d.gross_goods) DESC)::int AS rank
  FROM public.shop_product_sales_day d
 WHERE d.shop_id = $1::uuid
   AND d.local_date >= $2::date
   AND d.local_date <= $3::date
 GROUP BY d.product_id
`;

export async function readProductRanks(shopId: string, fromDate: string, toDate: string): Promise<Map<string, number>> {
  const res = await query<{ product_id: string; rank: number }>(SELECT_PRODUCT_RANKS, [shopId, fromDate, toDate]);
  return new Map(res.rows.map((r) => [r.product_id, r.rank]));
}

const SELECT_CANT_SUPPLY = `
SELECT p.id::text AS product_id, p.name, SUM(d.unavailable_units)::int AS units
  FROM public.shop_product_sales_day d
  JOIN public.product p ON p.id = d.product_id
 WHERE d.shop_id = $1::uuid
   AND d.local_date >= $2::date
   AND d.local_date <= $3::date
 GROUP BY p.id, p.name
HAVING SUM(d.unavailable_units) > 0
 ORDER BY SUM(d.unavailable_units) DESC, p.name
 LIMIT $4
`;

export async function readCantSupplyProducts(
  shopId: string,
  fromDate: string,
  toDate: string,
  limit: number,
): Promise<{ productId: string; name: string; units: number }[]> {
  const res = await query<{ product_id: string; name: string; units: number }>(SELECT_CANT_SUPPLY, [shopId, fromDate, toDate, limit]);
  return res.rows.map((r) => ({ productId: r.product_id, name: r.name, units: r.units }));
}

/** The last eight weeks by weekday and hour, on the shop's clock, and how many of those weeks sold anything. */
const SELECT_RHYTHM = `
WITH hours AS (
  SELECT bucket_start AT TIME ZONE $2 AS local_at, orders
    FROM public.shop_sales_hour
   WHERE shop_id = $1::uuid
     AND orders > 0
     AND bucket_start >= now() - interval '56 days'
)
SELECT EXTRACT(ISODOW FROM local_at)::int AS weekday,
       EXTRACT(HOUR FROM local_at)::int AS hour,
       SUM(orders)::int AS orders,
       (SELECT COUNT(DISTINCT date_trunc('week', local_at)) FROM hours)::int AS weeks
  FROM hours
 GROUP BY 1, 2
 ORDER BY 1, 2
`;

export async function readRhythm(
  shopId: string,
  timezone: string,
): Promise<{ weeks: number; cells: { weekday: number; hour: number; orders: number }[] }> {
  const res = await query<{ weekday: number; hour: number; orders: number; weeks: number }>(SELECT_RHYTHM, [shopId, timezone]);
  return {
    weeks: res.rows[0]?.weeks ?? 0,
    cells: res.rows.map((r) => ({ weekday: r.weekday, hour: r.hour, orders: r.orders })),
  };
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
