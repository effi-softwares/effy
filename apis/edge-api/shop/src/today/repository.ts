// Live figures, counted on every request, never from the (minutes-behind) rollups.
import {
  EFFECTIVE_LOW_STOCK_THRESHOLD,
  LOW_STOCK_PREDICATE,
  LOW_STOCK_SEVERITY,
  query,
} from "@effy/edge-shared";
import { lineNameSql, variantLabelSql } from "@effy/edge-shared/catalog";
import { OPERATING_TZ, TODAY_EVENT_LIMIT } from "@effy/shared-types";

import { DELIVERED_BY_SQL, type DeliveredBy } from "../lib/delivered-by";
import type { Backlog, StockAttention, TodayEvent } from "./types";

/**
 * Backlog, ready and low-stock counts in one round trip. `awaiting_units` sums this shop's lines only.
 * `oldest_paid_at` is an instant, so the age keeps counting on screen.
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
  -- Counted per VARIANT: "1 kg running low" is a different shelf from "500 g".
  SELECT COUNT(*)::int AS skus,
         COUNT(*) FILTER (WHERE v.stock_on_hand <= 0)::int AS out_of_stock
    FROM public.product_variant v
    JOIN public.product p ON p.id = v.product_id
    LEFT JOIN public.shop_stock_settings s ON s.shop_id = v.shop_id
   WHERE v.shop_id = $1
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
 * Products needing restocking, by the shared `LOW_STOCK_PREDICATE`. `sold_7d` counts units that left
 * through paid orders only. `days_of_cover` is null, not 0, when nothing sold.
 */
const SELECT_STOCK_ATTENTION = `
SELECT p.id::text AS product_id,
       v.id::text AS variant_id,
       -- One row per VARIANT, named with its label ("Basmati Rice — 1 kg").
       ${lineNameSql("p.name", variantLabelSql("v"))} AS name,
       v.stock_on_hand AS on_hand,
       ${LOW_STOCK_SEVERITY} AS severity,
       COALESCE(d.sold_7d, 0)::int AS sold_7d,
       CASE WHEN COALESCE(d.sold_7d, 0) > 0
            THEN FLOOR(v.stock_on_hand::numeric / (d.sold_7d::numeric / 7))::int
            ELSE NULL END AS days_of_cover,
       COALESCE(m.last_moved_at, v.updated_at) AS since,
       ${EFFECTIVE_LOW_STOCK_THRESHOLD} AS effective_threshold
  FROM public.product_variant v
  JOIN public.product p ON p.id = v.product_id
  LEFT JOIN public.shop_stock_settings s ON s.shop_id = v.shop_id
  LEFT JOIN LATERAL (
    SELECT SUM(-sm.quantity_delta) AS sold_7d
      FROM public.stock_movement sm
     WHERE sm.variant_id = v.id
       AND sm.reason = 'order_paid'
       AND sm.created_at >= now() - interval '7 days'
  ) d ON true
  LEFT JOIN LATERAL (
    SELECT MAX(sm.created_at) AS last_moved_at
      FROM public.stock_movement sm
     WHERE sm.variant_id = v.id
  ) m ON true
 WHERE v.shop_id = $1
   AND ${LOW_STOCK_PREDICATE}
 -- Most urgent first, matching the restock list's own ordering so two screens never rank the same
 -- two variants differently.
 ORDER BY (v.stock_on_hand <= 0) DESC, v.stock_on_hand ASC, p.name ASC
 LIMIT $2
`;

interface StockRow {
  product_id: string;
  variant_id: string;
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
    variantId: r.variant_id,
    name: r.name,
    onHand: r.on_hand,
    soldLast7Days: r.sold_7d,
    daysOfCover: r.days_of_cover,
    severity: r.severity,
    since: r.since,
  }));
}

/**
 * What happened at this shop today, on Effy's clock, newest first. Five sources, because no one table holds it:
 * ⚠ a driver's collection writes no `fulfillment_event`, so hand-overs are read from `package_handover`, one row per
 * bag, grouped by the hand-over (`change_id`); arrivals are `package_arrival`. A reopened pick is not a new start.
 */
const SELECT_EVENTS = `
WITH day AS (
  SELECT date_trunc('day', now() AT TIME ZONE '${OPERATING_TZ}') AT TIME ZONE '${OPERATING_TZ}' AS start
)
SELECT * FROM (
  SELECT 'came_in:' || sf.id AS id, COALESCE(o.placed_at, o.created_at) AS at, 'came_in' AS kind,
         sf.id::text AS fulfillment_id, o.order_number, sf.item_count, ${DELIVERED_BY_SQL} AS delivered_by,
         NULL::int AS orders, NULL::text AS product_id, NULL::text AS variant_id, NULL::text AS name
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
   WHERE sf.shop_id = $1
     AND o.status IN ('paid', 'canceled')
     AND COALESCE(o.placed_at, o.created_at) >= (SELECT start FROM day)

  UNION ALL
  SELECT fe.id::text, fe.occurred_at,
         CASE fe.to_status WHEN 'picking' THEN 'picking' WHEN 'ready_for_pickup' THEN 'ready'
                           WHEN 'unfulfillable' THEN 'cant_supply' ELSE 'cancelled' END,
         sf.id::text, o.order_number, NULL, NULL, NULL, NULL, NULL, NULL
    FROM public.fulfillment_event fe
    JOIN public.shop_fulfillment sf ON sf.id = fe.shop_fulfillment_id
    JOIN public."order" o ON o.id = sf.order_id
   WHERE sf.shop_id = $1
     AND fe.event_type = 'state_changed'
     AND fe.to_status IN ('picking', 'ready_for_pickup', 'unfulfillable', 'withdrawn')
     AND NOT (fe.to_status = 'picking' AND fe.from_status = 'ready_for_pickup')
     AND fe.occurred_at >= (SELECT start FROM day)

  UNION ALL
  SELECT 'collected:' || ph.change_id, MIN(ph.recorded_at), 'collected',
         CASE WHEN COUNT(DISTINCT sf.id) = 1 THEN MIN(sf.id::text) END,
         CASE WHEN COUNT(DISTINCT sf.id) = 1 THEN MIN(o.order_number) END,
         NULL, NULL, COUNT(DISTINCT sf.id)::int, NULL, NULL, NULL
    FROM public.package_handover ph
    JOIN public.shop_fulfillment sf ON sf.id = ph.shop_fulfillment_id
    JOIN public."order" o ON o.id = sf.order_id
   WHERE sf.shop_id = $1
     AND ph.step IN ('collect', 'courier_handover', 'shop_pickup')
     AND ph.recorded_at >= (SELECT start FROM day)
   GROUP BY ph.change_id

  UNION ALL
  SELECT 'delivered:' || sf.id, pa.arrived_at, 'delivered',
         sf.id::text, o.order_number, NULL, NULL, NULL, NULL, NULL, NULL
    FROM public.package_arrival pa
    JOIN public.shop_fulfillment sf ON sf.id = pa.shop_fulfillment_id
    JOIN public."order" o ON o.id = sf.order_id
   WHERE sf.shop_id = $1
     AND pa.arrived_at >= (SELECT start FROM day)

  UNION ALL
  SELECT sm.id::text, sm.created_at, CASE WHEN sm.quantity_after = 0 THEN 'sold_out' ELSE 'restocked' END,
         NULL, NULL, NULL, NULL, NULL, p.id::text, v.id::text, ${lineNameSql("p.name", variantLabelSql("v"))}
    FROM public.stock_movement sm
    JOIN public.product_variant v ON v.id = sm.variant_id
    JOIN public.product p ON p.id = v.product_id
   WHERE sm.shop_id = $1
     AND sm.created_at >= (SELECT start FROM day)
     AND (   (sm.quantity_after = 0 AND sm.quantity_before > 0)
          OR (sm.quantity_before = 0 AND sm.quantity_after > 0))
) e
ORDER BY e.at DESC, e.id
LIMIT $2
`;

interface EventRow {
  id: string;
  at: Date;
  kind: TodayEvent["kind"];
  fulfillment_id: string | null;
  order_number: string | null;
  item_count: number | null;
  delivered_by: DeliveredBy | null;
  orders: number | null;
  product_id: string | null;
  variant_id: string | null;
  name: string | null;
}

function toEvent(r: EventRow): TodayEvent {
  const base = { id: r.id, at: r.at };
  switch (r.kind) {
    case "came_in":
      return { ...base, kind: r.kind, fulfillmentId: r.fulfillment_id!, orderNumber: r.order_number!, itemCount: r.item_count!, deliveredBy: r.delivered_by! };
    case "collected":
      return { ...base, kind: r.kind, orders: r.orders!, fulfillmentId: r.fulfillment_id, orderNumber: r.order_number };
    case "sold_out":
    case "restocked":
      return { ...base, kind: r.kind, productId: r.product_id!, variantId: r.variant_id!, name: r.name! };
    default:
      return { ...base, kind: r.kind, fulfillmentId: r.fulfillment_id!, orderNumber: r.order_number! };
  }
}

export async function readTodayEvents(shopId: string, limit = TODAY_EVENT_LIMIT): Promise<TodayEvent[]> {
  const res = await query<EventRow>(SELECT_EVENTS, [shopId, limit]);
  return res.rows.map(toEvent);
}

/** Validated against `pg_timezone_names`; an unknown zone falls back to the platform's, logged. */
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
