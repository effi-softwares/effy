// Today's board (redesign 2): every collection run today, the courier pickups, where today's orders are, who is
// picking, what missed its driver, what is selling and what the catalogue needs. Live rows, counted on each read, like
// the rest of Today. A shop's own rows only: every statement is keyed on `$1` = the shop.
import { packageStatuses, query } from "@effy/edge-shared";
import { COURIER_COLLECTION_SQL } from "@effy/edge-shared/delivery";
import { OPERATING_TZ, PACKAGE_STATUSES, type DeliveredBy, type PackageStatus } from "@effy/shared-types";

import { DELIVERED_BY_SQL } from "../lib/delivered-by";
import { REVIEW_STATE_SQL } from "../products/repository";

/** The start of the shop's day, in SQL: the platform's zone (shops follow it). */
const DAY = `(date_trunc('day', now() AT TIME ZONE '${OPERATING_TZ}') AT TIME ZONE '${OPERATING_TZ}')`;

/** A colleague's name as the team sees it; their email's name when they never gave one. */
const STAFF_NAME = `COALESCE(NULLIF(btrim(st.name), ''), split_part(st.email, '@', 1))`;

/**
 * What each of today's collection runs took from this shop: what the driver left with, and what was not ready when it
 * came (`not_available`). A package still `assigned` has not been collected yet and is counted from the shelf instead.
 */
const SELECT_RUNS_DONE = `
SELECT dr.deadline_at AS run_at,
       COUNT(*) FILTER (WHERE rp.state <> 'not_available')::int AS collected,
       COUNT(*) FILTER (WHERE rp.state = 'not_available')::int AS missed,
       MAX(rp.settled_at) FILTER (WHERE rp.state <> 'not_available') AS collected_at,
       MIN(COALESCE(o.placed_at, o.created_at)) AS first_paid_at
  FROM public.round_stop rs
  JOIN public.driver_round dr ON dr.id = rs.round_id
  JOIN public.round_package rp ON rp.stop_id = rs.id
  JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
  JOIN public."order" o ON o.id = sf.order_id
 WHERE rs.kind = 'shop_pickup'
   AND rs.shop_id = $1::uuid
   AND dr.kind = 'collection'
   AND dr.status <> 'cancelled'
   AND rp.state <> 'assigned'
   AND dr.deadline_at >= ${DAY}
   AND dr.deadline_at < ${DAY} + interval '1 day'
 GROUP BY dr.deadline_at
`;

export interface RunDone {
  runAt: Date;
  collected: number;
  missed: number;
  collectedAt: Date | null;
  firstPaidAt: Date | null;
}

export async function readRunsDone(shopId: string): Promise<RunDone[]> {
  const res = await query<{ run_at: Date; collected: number; missed: number; collected_at: Date | null; first_paid_at: Date | null }>(SELECT_RUNS_DONE, [shopId]);
  return res.rows.map((r) => ({ runAt: r.run_at, collected: r.collected, missed: r.missed, collectedAt: r.collected_at, firstPaidAt: r.first_paid_at }));
}

/** Orders still here that were not ready when a driver came for them in the last day, oldest miss first. */
const SELECT_LATE = `
SELECT sf.id::text AS fulfillment_id, o.order_number, sf.status,
       (SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_item oi WHERE oi.order_id = o.id AND oi.shop_id = sf.shop_id)::int AS units,
       MAX(dr.deadline_at) AS missed_run_at,
       (SELECT ${STAFF_NAME}
          FROM public.fulfillment_event fe
          JOIN public.shop_staff st ON st.id = fe.actor_staff_id
         WHERE fe.shop_fulfillment_id = sf.id AND fe.event_type = 'state_changed' AND fe.to_status = 'picking'
         ORDER BY fe.occurred_at DESC
         LIMIT 1) AS picker
  FROM public.round_package rp
  JOIN public.round_stop rs ON rs.id = rp.stop_id AND rs.kind = 'shop_pickup' AND rs.shop_id = $1::uuid
  JOIN public.driver_round dr ON dr.id = rs.round_id AND dr.kind = 'collection' AND dr.status <> 'cancelled'
  JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
  JOIN public."order" o ON o.id = sf.order_id
 WHERE rp.state = 'not_available'
   AND sf.status IN ('pending', 'received', 'picking', 'ready_for_pickup')
   AND dr.deadline_at >= now() - interval '24 hours'
 GROUP BY sf.id, o.id, o.order_number, sf.status
 ORDER BY MAX(dr.deadline_at), o.order_number
 LIMIT 50
`;

export interface LateRow {
  fulfillmentId: string;
  orderNumber: string;
  units: number;
  missedRunAt: Date;
  stage: "waiting" | "picking" | "ready";
  picker: string | null;
}

const stageOf = (status: string): LateRow["stage"] =>
  status === "ready_for_pickup" ? "ready" : status === "picking" ? "picking" : "waiting";

export async function readLate(shopId: string): Promise<LateRow[]> {
  const res = await query<{ fulfillment_id: string; order_number: string; status: string; units: number; missed_run_at: Date; picker: string | null }>(SELECT_LATE, [shopId]);
  return res.rows.map((r) => ({
    fulfillmentId: r.fulfillment_id,
    orderNumber: r.order_number,
    units: r.units,
    missedRunAt: r.missed_run_at,
    stage: stageOf(r.status),
    picker: r.picker,
  }));
}

/** Being picked now, longest first, with who started it. */
const SELECT_PICKING = `
SELECT sf.id::text AS fulfillment_id, o.order_number, ${DELIVERED_BY_SQL} AS delivered_by,
       (SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_item oi WHERE oi.order_id = o.id AND oi.shop_id = sf.shop_id)::int AS units,
       COALESCE(pe.occurred_at, sf.state_changed_at) AS started_at,
       ${STAFF_NAME} AS picker
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  LEFT JOIN LATERAL (
    SELECT fe.occurred_at, fe.actor_staff_id
      FROM public.fulfillment_event fe
     WHERE fe.shop_fulfillment_id = sf.id AND fe.event_type = 'state_changed' AND fe.to_status = 'picking'
     ORDER BY fe.occurred_at DESC
     LIMIT 1
  ) pe ON true
  LEFT JOIN public.shop_staff st ON st.id = pe.actor_staff_id
 WHERE sf.shop_id = $1::uuid
   AND sf.status = 'picking'
 ORDER BY started_at
 LIMIT 20
`;

export interface PickingRow {
  fulfillmentId: string;
  orderNumber: string;
  units: number;
  startedAt: Date;
  picker: string | null;
  deliveredBy: DeliveredBy;
}

export async function readPicking(shopId: string): Promise<PickingRow[]> {
  const res = await query<{ fulfillment_id: string; order_number: string; delivered_by: DeliveredBy; units: number; started_at: Date; picker: string | null }>(SELECT_PICKING, [shopId]);
  return res.rows.map((r) => ({
    fulfillmentId: r.fulfillment_id,
    orderNumber: r.order_number,
    units: r.units,
    startedAt: r.started_at,
    picker: r.picker,
    deliveredBy: r.delivered_by,
  }));
}

/** Today's orders, by where their package is now: the nine words, read through the one status rule. */
const SELECT_TODAY_PACKAGES = `
SELECT sf.id::text AS id, ${DELIVERED_BY_SQL} AS delivered_by
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
 WHERE sf.shop_id = $1::uuid
   AND o.status IN ('paid', 'canceled')
   AND COALESCE(o.placed_at, o.created_at) >= ${DAY}
`;

export type PackageCounts = Record<DeliveredBy, Record<PackageStatus, number>>;

const zero = (): Record<PackageStatus, number> => Object.fromEntries(PACKAGE_STATUSES.map((s) => [s, 0])) as Record<PackageStatus, number>;

export async function readPackageCounts(shopId: string): Promise<PackageCounts> {
  const res = await query<{ id: string; delivered_by: DeliveredBy }>(SELECT_TODAY_PACKAGES, [shopId]);
  const out: PackageCounts = { effy_driver: zero(), courier: zero() };
  if (res.rows.length === 0) return out;
  const statuses = await packageStatuses({ query }, res.rows.map((r) => r.id), "shop");
  for (const r of res.rows) {
    const s = statuses.get(r.id);
    if (s) out[r.delivered_by][s.status] += 1;
  }
  return out;
}

/** This shop's goods sold today, most first, with what it has left across its counted sizes. */
const SELECT_SELLING = `
SELECT p.id::text AS product_id, p.name, SUM(oi.quantity)::int AS units,
       (SELECT SUM(GREATEST(v.stock_on_hand, 0))::int FROM public.product_variant v
         WHERE v.product_id = p.id AND v.state <> 'removed' AND v.stock_tracked) AS stock_left
  FROM public."order" o
  JOIN public.order_item oi ON oi.order_id = o.id AND oi.shop_id = $1::uuid
  JOIN public.product p ON p.id = oi.product_id
 WHERE o.status = 'paid'
   AND COALESCE(o.placed_at, o.created_at) >= ${DAY}
 GROUP BY p.id, p.name
 ORDER BY SUM(oi.quantity) DESC, p.name
 LIMIT 5
`;

export async function readSelling(shopId: string): Promise<{ productId: string; name: string; units: number; stockLeft: number | null }[]> {
  const res = await query<{ product_id: string; name: string; units: number; stock_left: number | null }>(SELECT_SELLING, [shopId]);
  return res.rows.map((r) => ({ productId: r.product_id, name: r.name, units: r.units, stockLeft: r.stock_left }));
}

/** What the catalogue needs: the Catalog list's own Missing details and review filters, counted. */
const SELECT_CATALOG = `
SELECT COUNT(*) FILTER (WHERE p.status <> 'archived' AND EXISTS (SELECT 1 FROM public.product_missing_required(p.id)))::int AS missing,
       COUNT(*) FILTER (WHERE ${REVIEW_STATE_SQL} IN ('in_review', 'live_change_pending'))::int AS in_review,
       COUNT(*) FILTER (WHERE ${REVIEW_STATE_SQL} IN ('sent_back', 'live_change_sent_back'))::int AS sent_back
  FROM public.product p
  LEFT JOIN public.product_change pc ON pc.product_id = p.id
 WHERE p.shop_id = $1::uuid
`;

export async function readCatalogCounts(shopId: string): Promise<{ missingDetails: number; inReview: number; sentBack: number }> {
  const res = await query<{ missing: number; in_review: number; sent_back: number }>(SELECT_CATALOG, [shopId]);
  const r = res.rows[0];
  return { missingDetails: r?.missing ?? 0, inReview: r?.in_review ?? 0, sentBack: r?.sent_back ?? 0 };
}

/** Today's courier pickups from this shop: the latest live consignment of each parcel booked for today. */
const SELECT_PICKUPS = `
SELECT to_char(cc.pickup_from, 'HH24:MI') AS pickup_from,
       to_char(cc.pickup_to, 'HH24:MI') AS pickup_to,
       cs.courier_name,
       COUNT(*)::int AS parcels,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.carrier_handoff h WHERE h.shop_fulfillment_id = sf.id))::int AS handed_over
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  JOIN LATERAL (
    SELECT c.* FROM public.courier_consignment c
     WHERE c.shop_fulfillment_id = sf.id AND c.state <> 'cancelled'
     ORDER BY c.created_at DESC
     LIMIT 1
  ) cc ON true
  LEFT JOIN public.courier_service cs ON cs.id = COALESCE(cc.courier_service_id, o.courier_service_id)
 WHERE sf.shop_id = $1::uuid
   AND ${COURIER_COLLECTION_SQL("o")} = 'supplier'
   AND cc.pickup_date = (now() AT TIME ZONE '${OPERATING_TZ}')::date
 GROUP BY 1, 2, 3
 ORDER BY 1 NULLS LAST, 3
`;

export interface PickupRow {
  /** "HH:MM" on the shop's clock, or null. */
  from: string | null;
  to: string | null;
  courierName: string | null;
  parcels: number;
  handedOver: number;
}

export async function readPickupsToday(shopId: string): Promise<PickupRow[]> {
  const res = await query<{ pickup_from: string | null; pickup_to: string | null; courier_name: string | null; parcels: number; handed_over: number }>(SELECT_PICKUPS, [shopId]);
  return res.rows.map((r) => ({ from: r.pickup_from, to: r.pickup_to, courierName: r.courier_name, parcels: r.parcels, handedOver: r.handed_over }));
}
