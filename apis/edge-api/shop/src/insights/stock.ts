// Insights › Stock: stock as it is now, and as it moved in the window. Read live from the stock tables (the rollups
// keep sales, not shelves); demand comes from the daily product rollup. Never the order tables
// (`rollup-only.guard.test.ts` holds this file too). One shop, at most a month of its stock changes: a bounded read.
import { query } from "@effy/edge-shared";
import { lineNameSql, variantLabelSql } from "@effy/edge-shared/catalog";
import type { InsightsStockDTO } from "@effy/shared-types";

/** Days of demand the stock figures are measured against: the last four weeks. */
export const DEMAND_DAYS = 28;
/** "Runs out within three days". */
export const RUNNING_OUT_DAYS = 3;
/** A product counts as not selling after this long without a sale. */
export const NOT_SELLING_DAYS = 30;
const LIST_LIMIT = 10;

const money = (n: number) => n.toFixed(2);

/** A size with none left now that sold in the window, most sold first. */
const SELECT_OUT = `
SELECT p.id::text AS product_id, v.id::text AS variant_id,
       ${lineNameSql("p.name", variantLabelSql("v"))} AS name,
       s.sold::int AS sold,
       COALESCE((SELECT MAX(sm.created_at) FROM public.stock_movement sm WHERE sm.variant_id = v.id), v.updated_at) AS since
  FROM public.product_variant v
  JOIN public.product p ON p.id = v.product_id
  JOIN (SELECT d.product_id, SUM(d.units) AS sold
          FROM public.shop_product_sales_day d
         WHERE d.shop_id = $1::uuid AND d.local_date >= $2::date AND d.local_date <= $3::date
         GROUP BY d.product_id) s ON s.product_id = p.id
 WHERE v.shop_id = $1::uuid
   AND v.state = 'active'
   AND v.stock_tracked
   AND v.stock_on_hand <= 0
   AND s.sold > 0
 ORDER BY s.sold DESC, name
 LIMIT $4
`;

/** Counted products with stock left, and their units a day over the demand window. */
const SELECT_COVER = `
SELECT p.id::text AS product_id, p.name,
       SUM(GREATEST(v.stock_on_hand, 0))::int AS left_units,
       COALESCE((SELECT SUM(d.units) FROM public.shop_product_sales_day d
                  WHERE d.shop_id = $1::uuid AND d.product_id = p.id AND d.local_date >= $2::date AND d.local_date <= $3::date), 0)::int AS sold
  FROM public.product p
  JOIN public.product_variant v ON v.product_id = p.id AND v.state = 'active' AND v.stock_tracked
 WHERE p.shop_id = $1::uuid
   AND p.status = 'active'
 GROUP BY p.id, p.name
HAVING SUM(GREATEST(v.stock_on_hand, 0)) > 0
`;

/**
 * Each time a size reached none in the window, and when it came back: the next change that left it above none, else
 * now. With the product's demand over the demand window, for the guess at what selling out cost.
 */
const SELECT_SOLD_OUT = `
WITH outs AS (
  SELECT sm.variant_id, sm.product_id, sm.created_at AS out_at,
         (SELECT MIN(b.created_at) FROM public.stock_movement b
           WHERE b.variant_id = sm.variant_id AND b.created_at > sm.created_at AND b.quantity_after > 0) AS back_at
    FROM public.stock_movement sm
   WHERE sm.shop_id = $1::uuid
     AND sm.created_at >= $2 AND sm.created_at < $3
     AND sm.quantity_before > 0
     AND sm.quantity_after <= 0
)
SELECT o.variant_id::text AS variant_id, p.id::text AS product_id,
       ${lineNameSql("p.name", variantLabelSql("v"))} AS name,
       COUNT(*)::int AS times,
       SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(o.back_at, $3), $3) - o.out_at)))::float8 / 3600 AS hours,
       (v.stock_tracked AND v.stock_on_hand <= 0) AS still_out,
       COALESCE((SELECT SUM(d.units) FROM public.shop_product_sales_day d
                  WHERE d.shop_id = $1::uuid AND d.product_id = p.id AND d.local_date >= $4::date AND d.local_date <= $5::date), 0)::int AS demand_units,
       COALESCE((SELECT SUM(d.gross_goods) FROM public.shop_product_sales_day d
                  WHERE d.shop_id = $1::uuid AND d.product_id = p.id AND d.local_date >= $4::date AND d.local_date <= $5::date), 0)::text AS demand_gross
  FROM outs o
  JOIN public.product_variant v ON v.id = o.variant_id
  JOIN public.product p ON p.id = o.product_id
 GROUP BY o.variant_id, p.id, p.name, v.id
`;

/** On sale, with stock, and no sale in the last 30 days; only once the shop has sold for that long. */
const SELECT_NOT_SELLING = `
SELECT p.id::text AS product_id, p.name,
       SUM(GREATEST(v.stock_on_hand, 0))::int AS left_units,
       SUM(GREATEST(v.stock_on_hand, 0) * v.shop_price_amount)::text AS value
  FROM public.product p
  JOIN public.product_variant v ON v.product_id = p.id AND v.state = 'active' AND v.stock_tracked
 WHERE p.shop_id = $1::uuid
   AND p.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM public.shop_product_sales_day d
                    WHERE d.shop_id = $1::uuid AND d.product_id = p.id AND d.local_date >= $2::date AND d.units > 0)
 GROUP BY p.id, p.name
HAVING SUM(GREATEST(v.stock_on_hand, 0)) > 0
 ORDER BY SUM(GREATEST(v.stock_on_hand, 0) * v.shop_price_amount) DESC, p.name
 LIMIT $3
`;

const SELECT_FIRST_SALE = `SELECT MIN(local_date)::text AS first FROM public.shop_product_sales_day WHERE shop_id = $1::uuid`;

/** Recorded write-offs in the window: what left the shelf without a sale, at the shop's own price. */
const SELECT_WRITTEN_OFF = `
SELECT sm.reason,
       SUM(sm.quantity_delta)::int AS delta,
       SUM(-sm.quantity_delta * v.shop_price_amount)::text AS value
  FROM public.stock_movement sm
  JOIN public.product_variant v ON v.id = sm.variant_id
 WHERE sm.shop_id = $1::uuid
   AND sm.created_at >= $2 AND sm.created_at < $3
   AND sm.reason IN ('expiry', 'damage', 'correction')
 GROUP BY sm.reason
`;

export interface StockWindow {
  from: Date;
  to: Date;
  /** The window's local dates, inclusive. */
  fromDate: string;
  toDate: string;
  /** The demand window's local dates, inclusive: the last four weeks. */
  demandFrom: string;
  demandTo: string;
  /** NOT_SELLING_DAYS ago, as a local date. */
  notSellingSince: string;
}

export async function readStock(shopId: string, w: StockWindow): Promise<InsightsStockDTO> {
  const [out, cover, soldOut, notSelling, firstSale, writtenOff] = await Promise.all([
    query<{ product_id: string; variant_id: string; name: string; sold: number; since: Date }>(SELECT_OUT, [shopId, w.fromDate, w.toDate, LIST_LIMIT]),
    query<{ product_id: string; name: string; left_units: number; sold: number }>(SELECT_COVER, [shopId, w.demandFrom, w.demandTo]),
    query<{ variant_id: string; product_id: string; name: string; times: number; hours: number; still_out: boolean; demand_units: number; demand_gross: string }>(
      SELECT_SOLD_OUT,
      [shopId, w.from, w.to, w.demandFrom, w.demandTo],
    ),
    query<{ product_id: string; name: string; left_units: number; value: string }>(SELECT_NOT_SELLING, [shopId, w.notSellingSince, LIST_LIMIT]),
    query<{ first: string | null }>(SELECT_FIRST_SALE, [shopId]),
    query<{ reason: string; delta: number; value: string }>(SELECT_WRITTEN_OFF, [shopId, w.from, w.to]),
  ]);

  const runningOut = cover.rows
    .filter((r) => r.sold > 0)
    .map((r) => {
      const perDay = r.sold / DEMAND_DAYS;
      return { productId: r.product_id, name: r.name, left: r.left_units, perDay, daysLeft: r.left_units / perDay };
    })
    .filter((r) => r.daysLeft <= RUNNING_OUT_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name))
    .slice(0, LIST_LIMIT)
    .map((r) => ({ ...r, perDay: r.perDay.toFixed(1), daysLeft: r.daysLeft.toFixed(1) }));

  const demandHours = DEMAND_DAYS * 24;
  const soldOutRows = soldOut.rows
    .map((r) => {
      const unitsPerHour = r.demand_units / demandHours;
      const price = r.demand_units > 0 ? Number(r.demand_gross) / r.demand_units : 0;
      return {
        productId: r.product_id,
        variantId: r.variant_id,
        name: r.name,
        times: r.times,
        hours: Math.max(0, r.hours),
        stillOut: r.still_out,
        missed: Math.max(0, r.hours) * unitsPerHour * price,
      };
    })
    .sort((a, b) => b.missed - a.missed || b.hours - a.hours)
    .slice(0, LIST_LIMIT)
    .map((r) => ({ ...r, hours: r.hours.toFixed(1), missedRevenue: money(r.missed) }))
    .map(({ missed: _missed, ...r }) => r);

  const by = new Map(writtenOff.rows.map((r) => [r.reason, r]));
  const loss = (reason: string) => {
    const r = by.get(reason);
    return { units: r ? Math.max(0, -r.delta) : 0, value: money(r ? Math.max(0, Number(r.value)) : 0) };
  };

  const soldLongEnough = firstSale.rows[0]?.first ? firstSale.rows[0].first <= w.notSellingSince : false;

  return {
    outOfStock: out.rows.map((r) => ({ productId: r.product_id, variantId: r.variant_id, name: r.name, sold: r.sold, since: r.since.toISOString() })),
    runningOut,
    soldOut: soldOutRows,
    notSelling: soldLongEnough
      ? notSelling.rows.map((r) => ({ productId: r.product_id, name: r.name, left: r.left_units, value: money(Number(r.value)) }))
      : null,
    writtenOff: {
      expired: loss("expiry"),
      damaged: loss("damage"),
      corrections: { units: by.get("correction")?.delta ?? 0 },
    },
  };
}
