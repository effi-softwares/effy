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
  effyOrders: number;
  courierOrders: number;
  returningOrders: number;
  sizeSpread: number[];
}

const SELECT_HOURS = `
SELECT bucket_start, gross_goods, refunds, refunded_orders, orders, units,
       cant_supply, cant_supply_units, cancelled,
       finished_orders, finished_units_ordered, finished_units_supplied, ready_orders, ready_seconds, ready_spread,
       effy_orders, courier_orders, returning_orders, size_spread
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
  effy_orders: number;
  courier_orders: number;
  returning_orders: number;
  size_spread: number[];
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
    effyOrders: r.effy_orders,
    courierOrders: r.courier_orders,
    returningOrders: r.returning_orders,
    sizeSpread: r.size_spread,
  }));
}

export interface TopProductRow {
  productId: string;
  name: string;
  sku: string | null;
  imageKey: string | null;
  units: number;
  revenue: string;
  /** Units on hand across its counted sizes; null when no size counts stock. */
  stockLeft: number | null;
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
       SUM(d.gross_goods)::text AS revenue,
       (SELECT SUM(GREATEST(v.stock_on_hand, 0))::int FROM public.product_variant v
         WHERE v.product_id = p.id AND v.state <> 'removed' AND v.stock_tracked) AS stock_left
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
    stock_left: number | null;
  }>(SELECT_TOP_PRODUCTS, [shopId, fromDate, toDate, limit]);

  return res.rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    sku: r.sku,
    imageKey: r.image_key,
    units: r.units,
    revenue: r.revenue,
    stockLeft: r.stock_left,
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

/** Every product's goods sold in a window, most first: how few make most of the sales. */
export async function readProductSales(shopId: string, fromDate: string, toDate: string): Promise<number[]> {
  const res = await query<{ gross: string }>(
    `SELECT SUM(d.gross_goods)::text AS gross
       FROM public.shop_product_sales_day d
      WHERE d.shop_id = $1::uuid AND d.local_date >= $2::date AND d.local_date <= $3::date
      GROUP BY d.product_id
     HAVING SUM(d.gross_goods) > 0
      ORDER BY 1 DESC`,
    [shopId, fromDate, toDate],
  );
  return res.rows.map((r) => Number(r.gross));
}

/** Goods sold by the top of each product's category tree (its aisle), most first. */
const SELECT_AISLES = `
SELECT top.id::text AS category_id, top.name, SUM(d.gross_goods)::text AS revenue
  FROM public.shop_product_sales_day d
  JOIN public.product p ON p.id = d.product_id
  JOIN public.category_ancestor ca ON ca.category_id = p.primary_category_id
  JOIN public.category top ON top.id = ca.ancestor_id AND top.parent_id IS NULL
 WHERE d.shop_id = $1::uuid
   AND d.local_date >= $2::date
   AND d.local_date <= $3::date
 GROUP BY top.id, top.name
 ORDER BY SUM(d.gross_goods) DESC, top.name
`;

export async function readAisles(
  shopId: string,
  fromDate: string,
  toDate: string,
): Promise<{ categoryId: string; name: string; revenue: string }[]> {
  const res = await query<{ category_id: string; name: string; revenue: string }>(SELECT_AISLES, [shopId, fromDate, toDate]);
  return res.rows.map((r) => ({ categoryId: r.category_id, name: r.name, revenue: r.revenue }));
}

/** Sales by local weekday over [from, to): the client divides by the weeks. */
export async function readWeekdaySales(shopId: string, timezone: string, from: Date, to: Date): Promise<Map<number, number>> {
  const res = await query<{ weekday: number; revenue: string }>(
    `SELECT EXTRACT(ISODOW FROM bucket_start AT TIME ZONE $2)::int AS weekday,
            SUM(gross_goods - refunds)::text AS revenue
       FROM public.shop_sales_hour
      WHERE shop_id = $1::uuid AND bucket_start >= $3 AND bucket_start < $4
      GROUP BY 1`,
    [shopId, timezone, from, to],
  );
  return new Map(res.rows.map((r) => [r.weekday, Number(r.revenue)]));
}

/** Time to ready by the local hour orders became ready, over [from, to). */
export async function readReadyByHour(
  shopId: string,
  timezone: string,
  from: Date,
  to: Date,
): Promise<{ hour: number; seconds: number; orders: number }[]> {
  const res = await query<{ hour: number; seconds: string; orders: number }>(
    `SELECT EXTRACT(HOUR FROM bucket_start AT TIME ZONE $2)::int AS hour,
            SUM(ready_seconds)::text AS seconds,
            SUM(ready_orders)::int AS orders
       FROM public.shop_sales_hour
      WHERE shop_id = $1::uuid AND bucket_start >= $3 AND bucket_start < $4 AND ready_orders > 0
      GROUP BY 1
      ORDER BY 1`,
    [shopId, timezone, from, to],
  );
  return res.rows.map((r) => ({ hour: r.hour, seconds: Math.round(Number(r.seconds) / r.orders), orders: r.orders }));
}

/** Pairs of this shop's products in the same order, most first. */
const SELECT_PAIRS = `
SELECT pa.id::text AS a_id, pa.name AS a_name, pb.id::text AS b_id, pb.name AS b_name, SUM(x.orders)::int AS orders
  FROM public.shop_product_pair_day x
  JOIN public.product pa ON pa.id = x.product_a
  JOIN public.product pb ON pb.id = x.product_b
 WHERE x.shop_id = $1::uuid
   AND x.local_date >= $2::date
   AND x.local_date <= $3::date
 GROUP BY pa.id, pa.name, pb.id, pb.name
HAVING SUM(x.orders) >= 2
 ORDER BY SUM(x.orders) DESC, pa.name, pb.name
 LIMIT $4
`;

export async function readPairs(
  shopId: string,
  fromDate: string,
  toDate: string,
  limit: number,
): Promise<{ a: { productId: string; name: string }; b: { productId: string; name: string }; orders: number }[]> {
  const res = await query<{ a_id: string; a_name: string; b_id: string; b_name: string; orders: number }>(SELECT_PAIRS, [shopId, fromDate, toDate, limit]);
  return res.rows.map((r) => ({ a: { productId: r.a_id, name: r.a_name }, b: { productId: r.b_id, name: r.b_name }, orders: r.orders }));
}

/** Effy collection runs over [from, to), by their local time of day: what the drivers came for, and what was ready. */
export async function readRuns(
  shopId: string,
  timezone: string,
  from: Date,
  to: Date,
): Promise<{ time: string; due: number; ready: number }[]> {
  const res = await query<{ time: string; due: number; ready: number }>(
    `SELECT to_char(run_at AT TIME ZONE $2, 'HH24:MI') AS time, SUM(due)::int AS due, SUM(ready)::int AS ready
       FROM public.shop_run_figures
      WHERE shop_id = $1::uuid AND run_at >= $3 AND run_at < $4
      GROUP BY 1
      ORDER BY 1`,
    [shopId, timezone, from, to],
  );
  return res.rows;
}

/** Who finished a window's portions, most first. */
export async function readPickers(
  shopId: string,
  fromDate: string,
  toDate: string,
): Promise<{ staffId: string; name: string; orders: number; readyOrders: number; readySeconds: number; cantUnits: number }[]> {
  const res = await query<{ staff_id: string; name: string | null; email: string | null; orders: number; ready_orders: number; ready_seconds: string; cant_units: number }>(
    `SELECT s.id::text AS staff_id, s.name, s.email,
            SUM(d.orders)::int AS orders, SUM(d.ready_orders)::int AS ready_orders,
            SUM(d.ready_seconds)::text AS ready_seconds, SUM(d.cant_units)::int AS cant_units
       FROM public.shop_picker_day d
       JOIN public.shop_staff s ON s.id = d.staff_id
      WHERE d.shop_id = $1::uuid AND d.local_date >= $2::date AND d.local_date <= $3::date
      GROUP BY s.id, s.name, s.email
      ORDER BY SUM(d.orders) DESC, s.name`,
    [shopId, fromDate, toDate],
  );
  return res.rows.map((r) => ({
    staffId: r.staff_id,
    name: r.name?.trim() || r.email?.split("@")[0] || "A colleague",
    orders: r.orders,
    readyOrders: r.ready_orders,
    readySeconds: Number(r.ready_seconds),
    cantUnits: r.cant_units,
  }));
}
