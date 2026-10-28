import { COURIER_COLLECTION_SQL } from "@effy/edge-shared/delivery";
import type { DeliveryFeeBreakdownDTO, HandoverPreference, OrderAwaiting } from "@effy/shared-types";

import {
  cappedCountSql,
  dayRangeCondition,
  keysetColumns,
  keysetCondition,
  likePattern,
  orderBy,
  pageClause,
  query,
} from "@effy/edge-shared";

import { ORDER_LIST, type OrderListRequest, type OrderListView } from "./list";

import { DELIVERY_DUE_SQL } from "./assignments";

/**
 * What decides when courier package `sf` of order `o` is due out: its collection mode, hub check-in
 * and its service's pickup days. Turned into a moment by `nextCourierPickup`, never in SQL.
 */
const COURIER_FACTS = `
            ${COURIER_COLLECTION_SQL("o")} AS courier_collection,
            (SELECT hc.checked_in_at FROM public.round_package rp
               JOIN public.round_stop rs ON rs.id = rp.stop_id
               JOIN public.driver_round dr ON dr.id = rs.round_id AND dr.kind = 'collection'
               JOIN public.hub_checkin hc ON hc.round_id = dr.id
              WHERE rp.shop_fulfillment_id = sf.id AND rp.state = 'picked_up'
              ORDER BY hc.checked_in_at DESC LIMIT 1) AS checked_in_at,
            cs.pickup_weekdays::int[] AS service_weekdays,
            to_char(cs.pickup_cutoff, 'HH24:MI') AS service_cutoff`;

/**
 * An open courier problem on package `sf`: the live consignment's latest step is failed, lost,
 * damaged or returned and unresolved; the same states the status word reads as Problem. Late is not a problem.
 */
const OPEN_COURIER_PROBLEM = `EXISTS (
  SELECT 1 FROM public.courier_consignment cp
   WHERE cp.shop_fulfillment_id = sf.id AND cp.state IN ('failed', 'lost', 'damaged', 'returned'))`;

/** The live consignment's service, else the order's. Join after `o`. */
const COURIER_SERVICE_JOIN = `
  LEFT JOIN public.courier_consignment cc ON cc.shop_fulfillment_id = sf.id AND cc.state <> 'cancelled'
  LEFT JOIN public.courier_service cs ON cs.id = COALESCE(cc.courier_service_id, o.courier_service_id)`;

export interface OrderSummaryRow {
  id: string;
  order_number: string;
  status: string;
  placed_at: Date | null;
  /** When the order row was written; the list orders and filters on it (placed_at is null before payment). */
  created_at: Date;
  customer_email: string;
  item_count: number;
  package_count: number;
  awaiting_handover: number;
  awaiting_arrival: number;
  courier_problems: number;
  grand_total_amount: string;
  currency: string;
  statuses: string[];
  /** Every package's id, for one more query on where each is. */
  package_ids: string[];
  delivery_type: "effy" | "courier";
  /** Null for a courier order. */
  delivery_promise?: "window" | "day" | "asap" | null;
}

/** The filters the list and its view counts share (everything but the view and the paging). */
export interface ListParams {
  q?: string;
  status?: string;
  deliveryType?: "effy" | "courier";
  promise?: "window" | "day" | "asap";
  shopId?: string;
  placedFrom?: string;
  placedTo?: string;
}

/**
 * `awaiting` is derived from the absence of handoff or arrival rows, never stored. Keyset paging, so
 * orders arriving while paging cause no repeats. The non-view filters are shared with `viewCounts`.
 */
function baseWhere(params: ListParams): { where: string[]; args: unknown[] } {
  const where: string[] = ["o.status <> 'pending_payment'"];
  const args: unknown[] = [];

  if (params.q) {
    args.push(likePattern(params.q));
    const like = args.length;
    // Or a package's label code exactly, upper-cased like its alphabet.
    args.push(params.q.trim().toUpperCase());
    const code = args.length;
    where.push(
      `(o.order_number ILIKE $${like} OR c.email::text ILIKE $${like}` +
        ` OR EXISTS (SELECT 1 FROM public.shop_fulfillment pc WHERE pc.order_id = o.id AND pc.package_code = $${code}))`,
    );
  }
  if (params.status) {
    args.push(params.status);
    where.push(`o.status = $${args.length}`);
  }
  if (params.deliveryType) {
    args.push(params.deliveryType);
    where.push(`o.delivery_type = $${args.length}`);
  }
  if (params.promise) {
    args.push(params.promise);
    where.push(`o.delivery_type = 'effy' AND COALESCE(o.delivery_promise, 'window') = $${args.length}`);
  }
  if (params.shopId) {
    // An order is in a shop's list when one of its packages is that shop's.
    args.push(params.shopId);
    where.push(`EXISTS (SELECT 1 FROM public.shop_fulfillment ps WHERE ps.order_id = o.id AND ps.shop_id = $${args.length}::uuid)`);
  }
  const placed = dayRangeCondition("o.created_at", { from: params.placedFrom, to: params.placedTo }, args);
  if (placed) where.push(placed);
  return { where, args };
}

/**
 * "Needs a driver": ready at a shop with no collection driver, or an Effy parcel at the hub whose
 * round has opened with no delivery driver (`DELIVERY_DUE_SQL`, shared with the assignment read).
 */
const NEEDS_DRIVER_SQL = `EXISTS (
      SELECT 1 FROM public.shop_fulfillment sf
        LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
       WHERE sf.order_id = o.id
         AND NOT EXISTS (SELECT 1 FROM public.round_package rp
                          WHERE rp.shop_fulfillment_id = sf.id AND rp.state = 'assigned')
         AND (sf.status = 'ready_for_pickup'
              OR (sf.status = 'collected' AND ${DELIVERY_DUE_SQL}
                  AND EXISTS (SELECT 1 FROM public.round_package crp
                                JOIN public.round_stop crs ON crs.id = crp.stop_id
                                JOIN public.hub_checkin hc ON hc.round_id = crs.round_id
                               WHERE crp.shop_fulfillment_id = sf.id AND crp.state = 'picked_up')))
    )`;

/** Expressed against the projection's own counts, so filter and badge agree. */
const AWAITING_SQL: Record<OrderAwaiting, string> = {
  handover: `EXISTS (
      SELECT 1 FROM public.shop_fulfillment sf
        LEFT JOIN public.carrier_handoff h ON h.shop_fulfillment_id = sf.id
       WHERE sf.order_id = o.id
         AND sf.status = 'collected'
         -- Only a courier's package is handed over; Effy delivers its own.
         AND o.delivery_type = 'courier'
         AND h.id IS NULL
    )`,
  // A portion the shop said it cannot supply.
  refund_decision: `EXISTS (
      SELECT 1 FROM public.shop_fulfillment sf
       WHERE sf.order_id = o.id AND sf.status = 'unfulfillable'
    )`,
  courier_problem: `EXISTS (SELECT 1 FROM public.shop_fulfillment sf WHERE sf.order_id = o.id AND ${OPEN_COURIER_PROBLEM})`,
  arrival: `EXISTS (
      SELECT 1 FROM public.shop_fulfillment sf
        LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
       WHERE sf.order_id = o.id AND pa.id IS NULL
    )`,
};

/** Each view counted under the other filters, with the list's own fragments. */
export interface ViewCountsRow {
  total: string;
  needs_driver: string;
  handover: string;
  arrival: string;
  refund_decision: string;
  courier_problem: string;
}

export async function viewCounts(params: ListParams): Promise<ViewCountsRow> {
  const { where, args } = baseWhere(params);
  const res = await query<ViewCountsRow>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE ${NEEDS_DRIVER_SQL})::text AS needs_driver,
            count(*) FILTER (WHERE ${AWAITING_SQL.handover})::text AS handover,
            count(*) FILTER (WHERE ${AWAITING_SQL.arrival})::text AS arrival,
            count(*) FILTER (WHERE ${AWAITING_SQL.refund_decision})::text AS refund_decision,
            count(*) FILTER (WHERE ${AWAITING_SQL.courier_problem})::text AS courier_problem
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
      WHERE ${where.join("\n        AND ")}`,
    args,
  );
  return res.rows[0]!;
}

/** What a view adds to the shared filters. */
function viewWhere(view: OrderListView | undefined): string | null {
  switch (view) {
    case "driver":
      return NEEDS_DRIVER_SQL;
    case "handover":
      return AWAITING_SQL.handover;
    case "arrival":
      return AWAITING_SQL.arrival;
    case "refund":
      return AWAITING_SQL.refund_decision;
    case "courier":
      return AWAITING_SQL.courier_problem;
    default:
      return null;
  }
}

/** The shared filters of a list request (the view and paging are the list's own). */
export function baseOf(req: OrderListRequest): ListParams {
  const f = req.filters;
  return { q: req.q ?? undefined, status: f.status, deliveryType: f.deliveryType, promise: f.promise, shopId: f.shopId, placedFrom: f.placedFrom, placedTo: f.placedTo };
}

/** How many orders the list holds under its filters and view, counted to the cap ("10,000+"). */
export async function countList(req: OrderListRequest): Promise<number> {
  const { where, args } = baseWhere(baseOf(req));
  const v = viewWhere(req.filters.view);
  if (v) where.push(v);
  const res = await query<{ n: number }>(
    cappedCountSql(`SELECT 1 FROM public."order" o JOIN public.customer c ON c.id = o.customer_id WHERE ${where.join(" AND ")}`),
    args,
  );
  return res.rows[0]?.n ?? 0;
}

/** One page, newest first (or by total), `pageSize + 1` rows so the caller knows whether there is a next. */
export async function list(req: OrderListRequest): Promise<(OrderSummaryRow & { list_sort_key: string; list_row_id: string })[]> {
  const { where, args } = baseWhere(baseOf(req));
  const v = viewWhere(req.filters.view);
  if (v) where.push(v);
  const after = keysetCondition(ORDER_LIST, req, args);
  if (after) where.push(after);
  const paging = pageClause(req, args);

  const res = await query<OrderSummaryRow & { list_sort_key: string; list_row_id: string }>(
    `SELECT o.id,
            o.order_number,
            o.status,
            o.placed_at,
            o.created_at,
            c.email::text AS customer_email,
            o.grand_total_amount::text,
            o.currency,
            o.delivery_type,
            o.delivery_promise,
            ${keysetColumns(ORDER_LIST, req)},
            COALESCE((SELECT SUM(oi.quantity)::int FROM public.order_item oi WHERE oi.order_id = o.id), 0) AS item_count,
            COALESCE(p.package_count, 0)     AS package_count,
            COALESCE(p.awaiting_handover, 0) AS awaiting_handover,
            COALESCE(p.awaiting_arrival, 0)  AS awaiting_arrival,
            COALESCE(p.courier_problems, 0)  AS courier_problems,
            COALESCE(p.statuses, ARRAY[]::text[]) AS statuses,
            COALESCE(p.package_ids, ARRAY[]::text[]) AS package_ids
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
  LEFT JOIN LATERAL (
            SELECT count(*)::int AS package_count,
                   count(*) FILTER (
                     WHERE sf.status = 'collected'
                       -- The same term as the filter above, so badge and filter agree.
                       AND o.delivery_type = 'courier'
                       AND h.id IS NULL
                   )::int AS awaiting_handover,
                   count(*) FILTER (WHERE pa.id IS NULL)::int AS awaiting_arrival,
                   -- The same term as the filter above.
                   count(*) FILTER (WHERE ${OPEN_COURIER_PROBLEM})::int AS courier_problems,
                   array_agg(sf.status ORDER BY sf.status) AS statuses,
                   array_agg(sf.id::text ORDER BY sf.id) AS package_ids
              FROM public.shop_fulfillment sf
         LEFT JOIN public.carrier_handoff h  ON h.shop_fulfillment_id = sf.id
         LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
             WHERE sf.order_id = o.id
            ) p ON TRUE
      WHERE ${where.join("\n        AND ")}
   ${orderBy(ORDER_LIST, req)}
      ${paging}`,
    args,
  );
  return res.rows;
}

export interface OrderDetailRow {
  id: string;
  order_number: string;
  status: string;
  placed_at: Date | null;
  created_at: Date;
  customer_id: string;
  customer_email: string;
  customer_name: string | null;
  item_subtotal_amount: string;
  delivery_fee_amount: string;
  /** Staff only. */
  delivery_fee_breakdown: DeliveryFeeBreakdownDTO;
  discount_amount: string;
  promo_code: string | null;
  delivery_discount_amount: string;
  promotions: { headline: string | null; name: string; code: string | null; goods: string; delivery: string }[] | null;
  grand_total_amount: string;
  currency: string;
  delivery_address: Record<string, unknown>;
  billing_address: Record<string, unknown> | null;
  /** Columns on the order, not keys in `delivery_address`. */
  delivery_handover: HandoverPreference | null;
  delivery_note: string | null;
  delivery_type: "effy" | "courier";
  delivery_type_reason: "in_coverage" | "out_of_coverage" | "no_window" | "staff_change";
  courier_estimate: string | null;
  courier_collection: "hub" | "supplier" | null;
  delivery_promise?: "window" | "day" | "asap" | null;
  asap_estimate?: string | null;
  payment_status: string | null;
  method_type: string | null;
  method_brand: string | null;
  method_last4: string | null;
  points_used?: number;
  points_value_amount?: string;
  card_paid_amount?: string | null;
}

export async function findOrder(orderId: string): Promise<OrderDetailRow | null> {
  const res = await query<OrderDetailRow>(
    `SELECT o.id, o.order_number, o.status, o.placed_at, o.created_at,
            o.customer_id,
            c.email::text AS customer_email,
            -- ⚠ given_name/family_name, NOT first_name/last_name: Cognito's standard attributes.
            NULLIF(TRIM(CONCAT_WS(' ', c.given_name, c.family_name)), '') AS customer_name,
            o.item_subtotal_amount::text,
            o.delivery_fee_amount::text,
            o.delivery_fee_breakdown,
            o.discount_amount::text,
            o.promo_code,
            o.delivery_discount_amount::text,
            (SELECT json_agg(json_build_object('headline', op.headline, 'name', op.name, 'code', op.code_text,
                                               'goods', op.goods_amount::text, 'delivery', op.delivery_amount::text) ORDER BY op.name)
               FROM public.order_promotion op WHERE op.order_id = o.id) AS promotions,
            o.grand_total_amount::text,
            o.currency,
            o.delivery_address,
            o.billing_address,
            o.delivery_handover,
            o.delivery_note,
            o.delivery_type, o.delivery_type_reason, o.courier_estimate, o.courier_collection,
            o.delivery_promise, o.asap_estimate,
            pay.status AS payment_status,
            pay.method_type, pay.method_brand, pay.method_last4,
            o.points_used, o.points_value_amount::text AS points_value_amount, pay.amount::text AS card_paid_amount
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
  LEFT JOIN public.payment pay ON pay.order_id = o.id
      WHERE o.id = $1`,
    [orderId],
  );
  return res.rows[0] ?? null;
}

/** Oldest first. Read only; consignment.ts writes. */
export async function courierCollectionHistory(orderId: string): Promise<{ from_mode: "hub" | "supplier"; to_mode: "hub" | "supplier"; actor_sub: string; note: string | null; created_at: Date }[]> {
  const res = await query<{ from_mode: "hub" | "supplier"; to_mode: "hub" | "supplier"; actor_sub: string; note: string | null; created_at: Date }>(
    `SELECT from_mode, to_mode, actor_sub, note, created_at FROM public.order_courier_collection_change WHERE order_id = $1 ORDER BY created_at`,
    [orderId],
  );
  return res.rows;
}

export interface DeliveryTypeChangeRow {
  from_type: "effy" | "courier" | null;
  to_type: "effy" | "courier";
  reason: "in_coverage" | "out_of_coverage" | "no_window" | "staff_change";
  actor_kind: "checkout" | "staff";
  actor_sub: string | null;
  note: string | null;
  created_at: Date;
}

/** Oldest first. Read only: `recordDeliveryType` is the one writer. */
export async function deliveryTypeHistory(orderId: string): Promise<DeliveryTypeChangeRow[]> {
  const res = await query<DeliveryTypeChangeRow>(
    `SELECT from_type, to_type, reason, actor_kind, actor_sub, note, created_at
       FROM public.order_delivery_type_change
      WHERE order_id = $1
      ORDER BY created_at ASC, (from_type IS NULL) DESC`,
    [orderId],
  );
  return res.rows;
}

export interface OrderItemRow {
  order_item_id: string;
  product_id: string;
  /** As sold. */
  variant_id: string;
  variant_label: string | null;
  variant_code: string | null;
  sku: string | null;
  product_name: string;
  unit_price_amount: string;
  quantity: number;
  line_subtotal_amount: string;
  shop_id: string;
}

export async function items(orderId: string): Promise<OrderItemRow[]> {
  const res = await query<OrderItemRow>(
    `SELECT oi.id AS order_item_id, oi.product_id, oi.product_name,
            oi.variant_id::text AS variant_id, oi.variant_label, oi.variant_code, oi.sku,
            oi.unit_price_amount::text, oi.quantity, oi.line_subtotal_amount::text, oi.shop_id
       FROM public.order_item oi
      WHERE oi.order_id = $1
   ORDER BY oi.product_name, oi.variant_label NULLS FIRST`,
    [orderId],
  );
  return res.rows;
}

export interface PackageRow {
  fulfillment_id: string;
  /** Printed on its label. */
  package_code: string;
  shop_id: string;
  shop_name: string;
  status: string;
  item_count: number;
  subtotal_amount: string;
  method: string | null;
  delivered_by: "effy" | "courier";
  /** The order was sold as a courier delivery: no promised day, no window. */
  courier_order: boolean;
  /** null while unpaid. */
  placed_date: string | null;
  handoff_reference: string | null;
  handoff_carrier: string | null;
  handoff_at: Date | null;
  handoff_by: string | null;
  handoff_note: string | null;
  arrival_at: Date | null;
  arrival_source: string | null;
  arrival_by: string | null;
  arrival_note: string | null;
  // Melbourne dates computed by Postgres; nothing downstream rebuilds one.
  promised_date: string | null;
  window_start: Date | null;
  window_end: Date | null;
  over_capacity: boolean;
  today: string;
  handoff_date: string | null;
  arrival_date: string | null;
  /** null unless a courier delivers. */
  courier_collection: "hub" | "supplier" | null;
  /** null when not checked in (or never going there). */
  checked_in_at: Date | null;
  /** The booked service, else the order's. */
  service_weekdays: number[] | null;
  service_cutoff: string | null;
}

const MEL_DATE = (expr: string) => `(${expr} AT TIME ZONE 'Australia/Melbourne')::date::text`;

export async function packages(orderId: string): Promise<PackageRow[]> {
  const res = await query<PackageRow>(
    `SELECT sf.id AS fulfillment_id, sf.package_code, sf.shop_id, s.name AS shop_name, sf.status,
            sf.item_count, sf.subtotal_amount::text, opd.method,
            o.delivery_type AS delivered_by,
            (o.delivery_type = 'courier') IS TRUE AS courier_order,
            ${MEL_DATE("o.placed_at")} AS placed_date,
            h.reference AS handoff_reference, h.carrier_name AS handoff_carrier,
            h.handed_over_at AS handoff_at, h.recorded_by_sub AS handoff_by, h.note AS handoff_note,
            pa.arrived_at AS arrival_at, pa.source AS arrival_source,
            pa.recorded_by_sub AS arrival_by, pa.note AS arrival_note,
            opd.promised_to::text AS promised_date,
            opd.window_start, opd.window_end,
            -- ⚠ The booking belongs to the ORDER; only its windowed packages are in the slot.
            COALESCE(opd.window_start IS NOT NULL AND b.over_capacity, false) AS over_capacity,
            ${MEL_DATE("now()")} AS today,
            ${MEL_DATE("h.handed_over_at")} AS handoff_date,
            ${MEL_DATE("pa.arrived_at")} AS arrival_date,
            ${COURIER_FACTS}
       FROM public.shop_fulfillment sf
       JOIN public."order" o ON o.id = sf.order_id
       JOIN public.shop s ON s.id = sf.shop_id
  LEFT JOIN public.order_package_delivery opd
         ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
  LEFT JOIN public.delivery_slot_booking b ON b.order_id = sf.order_id
  LEFT JOIN public.carrier_handoff h  ON h.shop_fulfillment_id = sf.id
  LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
  ${COURIER_SERVICE_JOIN}
      WHERE sf.order_id = $1
   ORDER BY s.name`,
    [orderId],
  );
  return res.rows;
}

export interface HistoryRow {
  at: Date;
  kind: string;
  summary: string;
  actor_sub: string | null;
  fulfillment_id: string | null;
}

/**
 * A read-side projection over `fulfillment_event`, `carrier_handoff` and `package_arrival`, never a
 * stored timeline. Nothing records the journey between "ready" and "arrived", so that span is silent.
 */
export async function history(orderId: string): Promise<HistoryRow[]> {
  const res = await query<HistoryRow>(
    `WITH pkg AS (SELECT id, order_id FROM public.shop_fulfillment WHERE order_id = $1)
     SELECT * FROM (
       SELECT fe.occurred_at AS at,
              'fulfillment'::text AS kind,
              CASE fe.event_type
                WHEN 'state_changed'   THEN 'Package ' || COALESCE(fe.to_status, '?')
                WHEN 'item_gathered'   THEN 'Item picked'
                WHEN 'item_unavailable' THEN 'Item marked unavailable'
                WHEN 'item_restored'   THEN 'Item restored'
                -- The shop console's two events; without a name the ELSE arm would show staff the raw value.
                WHEN 'note_added'      THEN 'Shop added an internal note'
                WHEN 'tags_changed'    THEN 'Shop changed its tags'
                ELSE fe.event_type
              END AS summary,
              NULL::text AS actor_sub,
              fe.shop_fulfillment_id AS fulfillment_id
         FROM public.fulfillment_event fe
         JOIN pkg ON pkg.id = fe.shop_fulfillment_id

       UNION ALL

       SELECT h.handed_over_at,
              'handoff'::text,
              -- ⚠ The summary reads the same with or without a reference. A missing
              -- consignment number is an ordinary state, not a gap to announce in the history.
              CASE WHEN h.carrier_name IS NOT NULL
                   THEN 'Handed to ' || h.carrier_name
                   ELSE 'Handed to carrier' END,
              h.recorded_by_sub,
              h.shop_fulfillment_id
         FROM public.carrier_handoff h
         JOIN pkg ON pkg.id = h.shop_fulfillment_id

       UNION ALL

       SELECT pa.arrived_at,
              'arrival'::text,
              CASE pa.source
                WHEN 'driver_proof'   THEN 'Delivered by an Effy driver'
                WHEN 'staff_recorded' THEN 'Arrival recorded by back-office'
                ELSE 'Arrival reported by carrier'
              END,
              pa.recorded_by_sub,
              pa.shop_fulfillment_id
         FROM public.package_arrival pa
         JOIN pkg ON pkg.id = pa.shop_fulfillment_id
     ) t
     ORDER BY at ASC`,
    [orderId],
  );
  return res.rows;
}

export interface CourierParcelRow {
  fulfillment_id: string;
  order_id: string;
  order_number: string;
  /** Null for a courier order: it was told an estimate, not a day. */
  promised_date: string | null;
  today: string;
  at_hub: boolean;
  courier_order: boolean;
  courier_collection: "hub" | "supplier";
  checked_in_at: Date | null;
  placed_at: Date | null;
  service_label: string | null;
  service_weekdays: number[] | null;
  service_cutoff: string | null;
  max_business_days: number | null;
  consignment_state: string | null;
  pickup_date: string | null;
  pickup_from: string | null;
  pickup_to: string | null;
  handed_over_at: Date | null;
}

/**
 * Every unfinished courier parcel of an order sold as courier delivery — no cap (103): the set is bounded by
 * what is in flight, and the service decides each one's stage and due time (`nextCourierPickup`), then pages.
 */
export async function courierParcels(): Promise<CourierParcelRow[]> {
  const res = await query<CourierParcelRow>(
    `SELECT sf.id AS fulfillment_id,
            o.id AS order_id,
            o.order_number,
            opd.promised_to::text AS promised_date,
            ${MEL_DATE("now()")} AS today,
            (sf.status = 'collected') AS at_hub,
            (o.delivery_type = 'courier') IS TRUE AS courier_order,
            ${COURIER_FACTS},
            o.placed_at,
            cs.courier_name || ' · ' || cs.service_name AS service_label,
            cs.max_business_days,
            cc.state AS consignment_state,
            cc.pickup_date::text AS pickup_date,
            to_char(cc.pickup_from, 'HH24:MI') AS pickup_from,
            to_char(cc.pickup_to, 'HH24:MI') AS pickup_to,
            h.handed_over_at
       FROM public.shop_fulfillment sf
       JOIN public."order" o ON o.id = sf.order_id
       JOIN public.order_package_delivery opd
         ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
  LEFT JOIN public.carrier_handoff h ON h.shop_fulfillment_id = sf.id
  LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
  ${COURIER_SERVICE_JOIN}
      WHERE o.status = 'paid'
        AND o.delivery_type = 'courier'
        AND o.delivery_type = 'courier'
        AND pa.id IS NULL
        AND sf.status NOT IN ('withdrawn', 'unfulfillable', 'delivered')
      ORDER BY o.order_number, sf.id`,
  );
  return res.rows;
}

/** Oldest first, with the driver's name. Staff only. */
export interface HandoverRow {
  package_id: string;
  step: string;
  method: string;
  recorded_at: Date;
  /** Null when shop or hub staff made the hand-over. */
  driver_name: string | null;
  actor_kind: "driver" | "shop_staff" | "admin_staff";
  parcel_id: string | null;
  parcel_code: string | null;
}

export async function handovers(packageIds: string[]): Promise<HandoverRow[]> {
  if (packageIds.length === 0) return [];
  const res = await query<HandoverRow>(
    `SELECT ph.shop_fulfillment_id::text AS package_id, ph.step, ph.handover_method AS method,
            ph.recorded_at, d.name AS driver_name, ph.actor_kind, ph.parcel_id::text AS parcel_id, pp.parcel_code
       FROM public.package_handover ph
       -- Shop and hub staff record hand-overs too: no driver on those rows.
       LEFT JOIN public.driver d ON d.id = ph.driver_id
       LEFT JOIN public.package_parcel pp ON pp.id = ph.parcel_id
      WHERE ph.shop_fulfillment_id = ANY($1::uuid[])
      ORDER BY ph.recorded_at, ph.id`,
    [packageIds],
  );
  return res.rows;
}

export interface ParcelRow {
  package_id: string;
  parcel_id: string;
  parcel_code: string;
  seq: number;
  of: number;
  zone: string;
  voided: boolean;
  print_count: number;
  last_step: string | null;
}

/** Voided ones included, with print count and latest step. */
export async function parcels(packageIds: string[]): Promise<ParcelRow[]> {
  if (packageIds.length === 0) return [];
  const res = await query<ParcelRow>(
    `SELECT p.shop_fulfillment_id::text AS package_id, p.id::text AS parcel_id, p.parcel_code, p.seq, p.zone,
            p.voided_at IS NOT NULL AS voided,
            (SELECT count(*) FROM public.package_parcel l
              WHERE l.shop_fulfillment_id = p.shop_fulfillment_id AND l.voided_at IS NULL)::int AS of,
            (SELECT count(*) FROM public.label_print lp WHERE lp.parcel_id = p.id)::int AS print_count,
            (SELECT h.step FROM public.package_handover h WHERE h.parcel_id = p.id
              ORDER BY h.recorded_at DESC, h.id DESC LIMIT 1) AS last_step
       FROM public.package_parcel p
      WHERE p.shop_fulfillment_id = ANY($1::uuid[])
      ORDER BY p.shop_fulfillment_id, p.voided_at IS NOT NULL, p.seq, p.numbered_at`,
    [packageIds],
  );
  return res.rows;
}

/**
 * "Today" is the Melbourne date. Orders count from `placed_at`; refunds on the day issued, in
 * `COUNTED_REFUND_STATUSES`.
 */
export interface TodayRow {
  date: string;
  effy: string;
  courier: string;
  refunded_orders: string;
  refunded_amount: string;
}

export async function today(countedRefundStatuses: readonly string[]): Promise<TodayRow> {
  const res = await query<TodayRow>(
    `WITH day AS (SELECT (now() AT TIME ZONE 'Australia/Melbourne')::date AS d)
     SELECT day.d::text AS date,
            (SELECT count(*) FROM public."order" o
              WHERE o.placed_at IS NOT NULL AND o.status <> 'pending_payment'
                AND o.delivery_type = 'effy'
                AND (o.placed_at AT TIME ZONE 'Australia/Melbourne')::date = day.d)::text AS effy,
            (SELECT count(*) FROM public."order" o
              WHERE o.placed_at IS NOT NULL AND o.status <> 'pending_payment'
                AND o.delivery_type = 'courier'
                AND (o.placed_at AT TIME ZONE 'Australia/Melbourne')::date = day.d)::text AS courier,
            (SELECT count(DISTINCT r.order_id) FROM public.refund r
              WHERE r.status = ANY($1::text[])
                AND (r.created_at AT TIME ZONE 'Australia/Melbourne')::date = day.d)::text AS refunded_orders,
            (SELECT COALESCE(sum(r.amount), 0) FROM public.refund r
              WHERE r.status = ANY($1::text[])
                AND (r.created_at AT TIME ZONE 'Australia/Melbourne')::date = day.d)::text AS refunded_amount
       FROM day`,
    [countedRefundStatuses],
  );
  return res.rows[0]!;
}
