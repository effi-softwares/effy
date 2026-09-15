// Today's reads: raw SQL, shop-scoped, counted on every request (058).
//
// ⚠ EVERY FIGURE HERE IS LIVE, AND NONE OF IT COMES FROM THE ROLLUPS (FR-025). The rollups are
// minutes behind by design; a pick backlog that is minutes behind is a person walking to a shelf
// for an order someone else already packed. The split is the whole point of the two screens having
// two endpoints: operational state is counted from the rows that define it, analytics is read from
// figures prepared ahead of time.
import {
  EFFECTIVE_LOW_STOCK_THRESHOLD,
  LOW_STOCK_PREDICATE,
  LOW_STOCK_SEVERITY,
  query,
} from "@effy/edge-shared";

import type { Backlog, LiveOrder, StockAttention } from "./types";

/** Portions nobody has started picking — the Orders list's "Awaiting pick" tab, to the letter. */
const AWAITING = `sf.status IN ('pending', 'received')`;

/**
 * The backlog, the ready count and the low-stock counts — ONE round trip.
 *
 * ⚠ `awaiting_units` sums THIS SHOP's lines on those orders (`oi.shop_id = sf.shop_id`), not the
 * order's lines: a two-shop order is two portions, and the units this shop has to pack are its own.
 * The same join rule as everywhere else in the shop family.
 *
 * ⚠ `oldest_paid_at` is an instant, not a duration. Ages are rendered client-side against the
 * server's clock, so "3 h 12 m" keeps counting while a tab sits open instead of freezing at whatever
 * it was when the response was built.
 */
const SELECT_BACKLOG = `
WITH portions AS (
  SELECT sf.id, sf.shop_id, sf.order_id, sf.status,
         COALESCE(o.placed_at, o.created_at) AS paid_at
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
   WHERE sf.shop_id = $1
),
awaiting AS (
  SELECT p.order_id, p.shop_id, p.paid_at
    FROM portions p
   WHERE p.status IN ('pending', 'received')
),
stock AS (
  SELECT COUNT(*)::int AS skus,
         COUNT(*) FILTER (WHERE p.stock_on_hand <= 0)::int AS out_of_stock
    FROM public.product p
    LEFT JOIN public.shop_stock_settings s ON s.shop_id = p.shop_id
   WHERE p.shop_id = $1
     AND ${LOW_STOCK_PREDICATE}
)
SELECT (SELECT COUNT(*) FROM awaiting)::int AS awaiting_orders,
       (SELECT COALESCE(SUM(oi.quantity), 0)
          FROM awaiting a
          JOIN public.order_item oi
            ON oi.order_id = a.order_id AND oi.shop_id = a.shop_id)::int AS awaiting_units,
       (SELECT MIN(paid_at) FROM awaiting) AS oldest_paid_at,
       (SELECT COUNT(*) FROM portions WHERE status = 'ready_for_pickup')::int AS ready_for_pickup,
       (SELECT skus FROM stock) AS low_stock_skus,
       (SELECT out_of_stock FROM stock) AS out_of_stock
`;

interface BacklogRow {
  awaiting_orders: number;
  awaiting_units: number;
  oldest_paid_at: Date | null;
  ready_for_pickup: number;
  low_stock_skus: number;
  out_of_stock: number;
}

export async function readBacklog(shopId: string): Promise<Backlog> {
  const res = await query<BacklogRow>(SELECT_BACKLOG, [shopId]);
  const r = res.rows[0]!;
  return {
    awaitingPick: {
      orders: r.awaiting_orders,
      units: r.awaiting_units,
      oldestPaidAt: r.oldest_paid_at,
    },
    readyForPickup: r.ready_for_pickup,
    lowStock: { skus: r.low_stock_skus, outOfStock: r.out_of_stock },
  };
}

/**
 * Products needing restocking, with the demand behind each.
 *
 * ⚠ THE PREDICATE IS THE SHARED ONE (`LOW_STOCK_PREDICATE`). The restock list, back-office and this
 * screen must not be able to disagree about what "running out" means — 054's lesson, made structural.
 *
 * ⚠ `sold_7d` is real recorded demand: units that left the shelf through a PAID ORDER in the last
 * seven days (`reason = 'order_paid'`, so a correction or a damage write-off is not read as
 * appetite). The imported design's "17 views today" has no equivalent on this platform — nothing
 * records product views for a shop — and inventing a number for that slot would put a figure on the
 * operator's screen that nothing can be held to.
 *
 * ⚠ `days_of_cover` is NULL rather than 0 when nothing sold. Zero would read as "no cover left,
 * act now"; the truth is "there is no demand to divide into", which is not urgent at all.
 */
const SELECT_STOCK_ATTENTION = `
SELECT p.id::text AS product_id,
       p.name,
       p.stock_on_hand AS on_hand,
       ${LOW_STOCK_SEVERITY} AS severity,
       COALESCE(d.sold_7d, 0)::int AS sold_7d,
       CASE WHEN COALESCE(d.sold_7d, 0) > 0
            THEN FLOOR(p.stock_on_hand::numeric / (d.sold_7d::numeric / 7))::int
            ELSE NULL END AS days_of_cover,
       COALESCE(m.last_moved_at, p.updated_at) AS since,
       ${EFFECTIVE_LOW_STOCK_THRESHOLD} AS effective_threshold
  FROM public.product p
  LEFT JOIN public.shop_stock_settings s ON s.shop_id = p.shop_id
  LEFT JOIN LATERAL (
    SELECT SUM(-sm.quantity_delta) AS sold_7d
      FROM public.stock_movement sm
     WHERE sm.product_id = p.id
       AND sm.reason = 'order_paid'
       AND sm.created_at >= now() - interval '7 days'
  ) d ON true
  LEFT JOIN LATERAL (
    SELECT MAX(sm.created_at) AS last_moved_at
      FROM public.stock_movement sm
     WHERE sm.product_id = p.id
  ) m ON true
 WHERE p.shop_id = $1
   AND ${LOW_STOCK_PREDICATE}
 -- Most urgent first, matching the restock list's own ordering so two screens never rank the same
 -- two products differently.
 ORDER BY (p.stock_on_hand <= 0) DESC, p.stock_on_hand ASC, p.name ASC
 LIMIT $2
`;

interface StockRow {
  product_id: string;
  name: string;
  on_hand: number;
  severity: "out" | "low";
  sold_7d: number;
  days_of_cover: number | null;
  since: Date;
}

export async function readStockAttention(shopId: string, limit: number): Promise<StockAttention[]> {
  const res = await query<StockRow>(SELECT_STOCK_ATTENTION, [shopId, limit]);
  return res.rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    onHand: r.on_hand,
    soldLast7Days: r.sold_7d,
    daysOfCover: r.days_of_cover,
    severity: r.severity,
    since: r.since,
  }));
}

/**
 * The five most recently paid orders at this shop.
 *
 * ⚠ EVERY ROW IS A STORED PORTION, and its id is what the row opens (FR-009). The imported design
 * generated arrivals on a timer and had to special-case rows whose detail page did not exist yet;
 * on this platform a shop learns of an order only after the payment transaction has committed and
 * fanned it out (019), so that state is unrepresentable here rather than merely handled.
 *
 * ⚠ The total is the ORDER's, the same figure the Orders list shows for this row (057 A3) — which is
 * deliberately NOT the basis Insights' Revenue uses (this shop's goods only, FR-032). The two
 * screens label theirs, so a $80 order beside a $30 revenue step is explainable rather than alarming.
 */
const SELECT_LIVE = `
SELECT sf.id::text AS fulfillment_id,
       o.order_number,
       COALESCE(o.delivery_address ->> 'recipientName', '') AS customer_name,
       COALESCE(o.placed_at, o.created_at) AS paid_at,
       sf.delivery_method,
       o.grand_total_amount::text AS total,
       o.currency,
       (SELECT COALESCE(SUM(oi.quantity), 0)
          FROM public.order_item oi
         WHERE oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id)::int AS item_count
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
 WHERE sf.shop_id = $1
   AND o.status IN ('paid', 'canceled')
 ORDER BY COALESCE(o.placed_at, o.created_at) DESC
 LIMIT $2
`;

interface LiveRow {
  fulfillment_id: string;
  order_number: string;
  customer_name: string;
  paid_at: Date;
  delivery_method: "same_day" | "standard" | null;
  total: string;
  currency: string;
  item_count: number;
}

export async function readLiveOrders(shopId: string, limit: number): Promise<LiveOrder[]> {
  const res = await query<LiveRow>(SELECT_LIVE, [shopId, limit]);
  return res.rows.map((r) => ({
    fulfillmentId: r.fulfillment_id,
    orderNumber: r.order_number,
    customerName: r.customer_name,
    paidAt: r.paid_at,
    itemCount: r.item_count,
    deliveryMethod: r.delivery_method,
    total: r.total,
    currency: r.currency,
  }));
}

/**
 * The shop's clock.
 *
 * ⚠ Validated against `pg_timezone_names` rather than trusted: a bad value would not throw, it would
 * silently shift every boundary on both screens — the day a figure belongs to, when "today" starts,
 * which hour a bar is. A shop whose zone is unrecognised falls back to the platform's, and the
 * service logs it, because a wrong day is worse than a default one.
 */
const SELECT_TIMEZONE = `
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = s.timezone)
            THEN s.timezone ELSE NULL END AS timezone,
       s.timezone AS raw_timezone,
       now() AS now
  FROM public.shop s
 WHERE s.id = $1
`;

export async function readClock(
  shopId: string,
): Promise<{ timezone: string | null; rawTimezone: string; now: Date }> {
  const res = await query<{ timezone: string | null; raw_timezone: string; now: Date }>(
    SELECT_TIMEZONE,
    [shopId],
  );
  const r = res.rows[0];
  return {
    timezone: r?.timezone ?? null,
    rawTimezone: r?.raw_timezone ?? "",
    now: r?.now ?? new Date(),
  };
}
