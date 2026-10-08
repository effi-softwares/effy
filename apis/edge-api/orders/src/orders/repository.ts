// Back-office order reads (053 US1). Raw SQL, no ORM (Principle VI).
//
// ⚠ THIS IS THE FIRST TIME ANYONE AT EFFY CAN LOOK AT AN ORDER. There has never been an order list
// or an order detail in any internal console, which is why a customer told "contact support and
// we'll sort it out" (020 FR-018b) reached people who could not see what they were being asked about.

import type { HandoverPreference, OrderAwaiting } from "@effy/shared-types";

import { query } from "@effy/edge-shared";

export interface OrderSummaryRow {
  id: string;
  order_number: string;
  status: string;
  placed_at: Date | null;
  /**
   * ⚠ THE PAGINATION KEY, and it must stay the SAME COLUMN the query orders and filters on.
   *
   * An earlier draft ordered by `created_at` but minted the cursor from `placed_at`. Those are
   * different instants — `created_at` is when the pending order row was written, `placed_at` is when
   * the payment webhook confirmed it — and `placed_at` is always the LATER one. So `created_at <
   * <a placed_at>` matched rows that had already been shown, and page 2 repeated part of page 1.
   *
   * It is also nullable, which would have silently ended pagination on any order that never reached
   * `paid`. `created_at` is NOT NULL.
   */
  created_at: Date;
  customer_email: string;
  item_count: number;
  package_count: number;
  awaiting_handover: number;
  awaiting_arrival: number;
  grand_total_amount: string;
  currency: string;
  statuses: string[];
  /** 073 — every package's id, so the list can show where each one is in one more query. */
  package_ids: string[];
}

export interface ListParams {
  q?: string;
  status?: string;
  awaiting?: OrderAwaiting;
  /** 073 — only orders with a package waiting for a driver that nobody has. */
  needsDriver?: boolean;
  cursor?: string;
  limit: number;
}

/**
 * The order list.
 *
 * ⚠ `awaiting` IS A JOIN, NOT A STORED STATE (research R3). It is derived from the ABSENCE of a
 * `carrier_handoff` or a `package_arrival` row, which is precisely why it can never drift from the
 * facts it summarises — there is no second column to forget to update.
 *
 * Keyset pagination on (placed_at, id), not OFFSET: an operator paging through while orders arrive
 * must not see a row twice or miss one.
 */
export async function list(params: ListParams): Promise<OrderSummaryRow[]> {
  const where: string[] = ["o.status <> 'pending_payment'"];
  const args: unknown[] = [];

  if (params.q) {
    args.push(`%${params.q}%`);
    // Reference OR customer email — the two things an operator actually has to hand.
    where.push(`(o.order_number ILIKE $${args.length} OR c.email::text ILIKE $${args.length})`);
  }
  if (params.status) {
    args.push(params.status);
    where.push(`o.status = $${args.length}`);
  }
  if (params.cursor) {
    args.push(params.cursor);
    where.push(`o.created_at < $${args.length}::timestamptz`);
  }

  // 073 — "Needs a driver": a package ready at a shop with no collection driver, or a same-day package
  // at the hub with no delivery driver. The same two conditions the assignment read shows as
  // "Unassigned", so the filter and the column cannot disagree.
  if (params.needsDriver) {
    where.push(`EXISTS (
      SELECT 1 FROM public.shop_fulfillment sf
       WHERE sf.order_id = o.id
         AND NOT EXISTS (SELECT 1 FROM public.round_package rp
                          WHERE rp.shop_fulfillment_id = sf.id AND rp.state = 'assigned')
         AND (sf.status = 'ready_for_pickup'
              OR (sf.status = 'collected' AND sf.delivery_method = 'same_day'
                  AND EXISTS (SELECT 1 FROM public.round_package crp
                                JOIN public.round_stop crs ON crs.id = crp.stop_id
                                JOIN public.hub_checkin hc ON hc.round_id = crs.round_id
                               WHERE crp.shop_fulfillment_id = sf.id AND crp.state = 'picked_up')))
    )`);
  }

  // The awaiting filter, expressed against the same derived counts the projection reports, so the
  // filter and the badge can never disagree about one order.
  if (params.awaiting === "handover") {
    where.push(`EXISTS (
      SELECT 1 FROM public.shop_fulfillment sf
        LEFT JOIN public.order_package_delivery opd
               ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
        LEFT JOIN public.carrier_handoff h ON h.shop_fulfillment_id = sf.id
       WHERE sf.order_id = o.id
         AND sf.status = 'collected'
         AND COALESCE(opd.method, 'standard') = 'standard'
         AND h.id IS NULL
    )`);
  } else if (params.awaiting === "refund_decision") {
    // ⚠ 055 US6 — a portion the shop said it cannot supply. Expressed against the same fact the
    // projection reports, so the filter and the badge can never disagree about one order.
    where.push(`EXISTS (
      SELECT 1 FROM public.shop_fulfillment sf
       WHERE sf.order_id = o.id AND sf.status = 'unfulfillable'
    )`);
  } else if (params.awaiting === "arrival") {
    where.push(`EXISTS (
      SELECT 1 FROM public.shop_fulfillment sf
        LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
       WHERE sf.order_id = o.id AND pa.id IS NULL
    )`);
  }

  args.push(params.limit);

  const res = await query<OrderSummaryRow>(
    `SELECT o.id,
            o.order_number,
            o.status,
            o.placed_at,
            o.created_at,
            c.email::text AS customer_email,
            o.grand_total_amount::text,
            o.currency,
            COALESCE((SELECT SUM(oi.quantity)::int FROM public.order_item oi WHERE oi.order_id = o.id), 0) AS item_count,
            COALESCE(p.package_count, 0)     AS package_count,
            COALESCE(p.awaiting_handover, 0) AS awaiting_handover,
            COALESCE(p.awaiting_arrival, 0)  AS awaiting_arrival,
            COALESCE(p.statuses, ARRAY[]::text[]) AS statuses,
            COALESCE(p.package_ids, ARRAY[]::text[]) AS package_ids
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
  LEFT JOIN LATERAL (
            SELECT count(*)::int AS package_count,
                   count(*) FILTER (
                     WHERE sf.status = 'collected'
                       AND COALESCE(opd.method, 'standard') = 'standard'
                       AND h.id IS NULL
                   )::int AS awaiting_handover,
                   count(*) FILTER (WHERE pa.id IS NULL)::int AS awaiting_arrival,
                   array_agg(sf.status ORDER BY sf.status) AS statuses,
                   array_agg(sf.id::text ORDER BY sf.id) AS package_ids
              FROM public.shop_fulfillment sf
         LEFT JOIN public.order_package_delivery opd
                ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
         LEFT JOIN public.carrier_handoff h  ON h.shop_fulfillment_id = sf.id
         LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
             WHERE sf.order_id = o.id
            ) p ON TRUE
      WHERE ${where.join("\n        AND ")}
   ORDER BY o.created_at DESC
      LIMIT $${args.length}`,
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
  discount_amount: string;
  promo_code: string | null;
  grand_total_amount: string;
  currency: string;
  delivery_address: Record<string, unknown>;
  billing_address: Record<string, unknown> | null;
  /** 066 — columns on the order, deliberately not keys in `delivery_address`. */
  delivery_handover: HandoverPreference | null;
  delivery_note: string | null;
  payment_status: string | null;
  method_type: string | null;
  method_brand: string | null;
  method_last4: string | null;
  /** 074 — points used, their value, and what the card paid (payment.amount). */
  points_used?: number;
  points_value_amount?: string;
  card_paid_amount?: string | null;
}

export async function findOrder(orderId: string): Promise<OrderDetailRow | null> {
  const res = await query<OrderDetailRow>(
    `SELECT o.id, o.order_number, o.status, o.placed_at, o.created_at,
            o.customer_id,
            c.email::text AS customer_email,
            -- ⚠ given_name/family_name, NOT first_name/last_name. 011's amendment named them after
            -- Cognito's standard attributes so they ride on the ID token without a bespoke claim.
            NULLIF(TRIM(CONCAT_WS(' ', c.given_name, c.family_name)), '') AS customer_name,
            o.item_subtotal_amount::text,
            o.delivery_fee_amount::text,
            o.discount_amount::text,
            pc.code AS promo_code,
            o.grand_total_amount::text,
            o.currency,
            o.delivery_address,
            o.billing_address,
            o.delivery_handover,
            o.delivery_note,
            pay.status AS payment_status,
            pay.method_type, pay.method_brand, pay.method_last4,
            o.points_used, o.points_value_amount::text AS points_value_amount, pay.amount::text AS card_paid_amount
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
  LEFT JOIN public.promo_code pc ON pc.id = o.promo_code_id
  LEFT JOIN public.payment pay ON pay.order_id = o.id
      WHERE o.id = $1`,
    [orderId],
  );
  return res.rows[0] ?? null;
}

export interface OrderItemRow {
  order_item_id: string;
  product_id: string;
  product_name: string;
  unit_price_amount: string;
  quantity: number;
  line_subtotal_amount: string;
  shop_id: string;
}

export async function items(orderId: string): Promise<OrderItemRow[]> {
  const res = await query<OrderItemRow>(
    `SELECT oi.id AS order_item_id, oi.product_id, oi.product_name,
            oi.unit_price_amount::text, oi.quantity, oi.line_subtotal_amount::text, oi.shop_id
       FROM public.order_item oi
      WHERE oi.order_id = $1
   ORDER BY oi.product_name`,
    [orderId],
  );
  return res.rows;
}

export interface PackageRow {
  fulfillment_id: string;
  shop_id: string;
  shop_name: string;
  status: string;
  item_count: number;
  subtotal_amount: string;
  method: string | null;
  handoff_reference: string | null;
  handoff_carrier: string | null;
  handoff_at: Date | null;
  handoff_by: string | null;
  handoff_note: string | null;
  arrival_at: Date | null;
  arrival_source: string | null;
  arrival_by: string | null;
  arrival_note: string | null;
  // 069 — what the package was promised, and the Melbourne dates the verdict is judged on. Every
  // date is computed by PostgreSQL in the operating timezone; nothing downstream rebuilds one.
  promised_date: string | null;
  window_start: Date | null;
  window_end: Date | null;
  over_capacity: boolean;
  today: string;
  handoff_date: string | null;
  arrival_date: string | null;
  carrier_lead_days: number;
}

/** Melbourne's calendar date for a timestamptz expression, as text. */
const MEL_DATE = (expr: string) => `(${expr} AT TIME ZONE 'Australia/Melbourne')::date::text`;

/**
 * The carrier lead time. ⚠ COALESCE to the migration's own default: the settings row is created by
 * the operator, and an order can exist before a hub is configured.
 */
const CARRIER_LEAD_DAYS = `COALESCE((SELECT carrier_lead_days FROM public.delivery_settings WHERE id = 1), 1)`;

export async function packages(orderId: string): Promise<PackageRow[]> {
  const res = await query<PackageRow>(
    `SELECT sf.id AS fulfillment_id, sf.shop_id, s.name AS shop_name, sf.status,
            sf.item_count, sf.subtotal_amount::text, opd.method,
            h.reference AS handoff_reference, h.carrier_name AS handoff_carrier,
            h.handed_over_at AS handoff_at, h.recorded_by_sub AS handoff_by, h.note AS handoff_note,
            pa.arrived_at AS arrival_at, pa.source AS arrival_source,
            pa.recorded_by_sub AS arrival_by, pa.note AS arrival_note,
            opd.promised_to::text AS promised_date,
            opd.window_start, opd.window_end,
            -- ⚠ The booking belongs to the ORDER; only its same-day packages are in the slot.
            COALESCE(opd.slot_id IS NOT NULL AND b.over_capacity, false) AS over_capacity,
            ${MEL_DATE("now()")} AS today,
            ${MEL_DATE("h.handed_over_at")} AS handoff_date,
            ${MEL_DATE("pa.arrived_at")} AS arrival_date,
            ${CARRIER_LEAD_DAYS}::int AS carrier_lead_days
       FROM public.shop_fulfillment sf
       JOIN public.shop s ON s.id = sf.shop_id
  LEFT JOIN public.order_package_delivery opd
         ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
  LEFT JOIN public.delivery_slot_booking b ON b.order_id = sf.order_id
  LEFT JOIN public.carrier_handoff h  ON h.shop_fulfillment_id = sf.id
  LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id
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
 * The order history.
 *
 * ⚠ A READ-SIDE PROJECTION over four sources, never a stored timeline (data-model §8). A stored one
 * would be a FOURTH place every state change has to be written — and the first place it gets
 * forgotten, because nothing fails when an append is missed.
 *
 * Sources: `fulfillment_event` (020, the shop's picking), `carrier_handoff` and `package_arrival`
 * (053).
 *
 * ⚠ IT WAS A FOUR-WAY UNION AND IS NOW THREE. The driver branch read `driver_task_event` joined
 * through `collection_task` / `delivery_task_package`, all dropped by
 * db/migrations/20260920101500_remove_driver_work_model.sql. The projection shape is unchanged and
 * the branch comes back with whatever the dispatch slice records — which is the point of deriving
 * this on read rather than storing a timeline nobody remembers to append to.
 *
 * ⚠ CONSEQUENCE FOR AN OPERATOR: between "the shop marked it ready" and "it arrived" the history is
 * now silent, because nothing records the journey. That silence is accurate. It is not a gap in this
 * query.
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
                -- 057 A3 — the shop console's two events. Named here in the same change that
                -- widened the CHECK, or the ELSE arm would print the raw wire value to staff.
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
              -- ⚠ The summary reads the same with or without a reference (FR-003). A missing
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

// ── 069: the carrier handover list ───────────────────────────────────────────────────────────────

export interface HandoverRow {
  fulfillment_id: string;
  order_id: string;
  order_number: string;
  promised_date: string;
  due_on: string;
  today: string;
  at_hub: boolean;
}

/**
 * Standard packages with a promised day that have not been handed to the carrier (069 US7).
 *
 * `due` selects against the day each must leave the hub — its promised day minus the carrier lead
 * time: "today" is due today, "overdue" should already have gone, "upcoming" is not due yet.
 *
 * ⚠ A PACKAGE WITH NO PROMISED DAY NEVER APPEARS. Every order placed before 069 was promised none
 * (research R1); listing it as overdue would be inventing a promise in order to have broken it. The
 * existing "awaiting handover" filter on the order list still finds those.
 *
 * ⚠ NOT LIMITED TO PACKAGES ALREADY AT THE HUB. A package due out today that the driver has not
 * collected yet is exactly the one staff most need to see; `at_hub` says which it is.
 */
export async function handovers(due: "today" | "overdue" | "upcoming"): Promise<HandoverRow[]> {
  const cmp = due === "today" ? "=" : due === "overdue" ? "<" : ">";
  const res = await query<HandoverRow>(
    `SELECT * FROM (
       SELECT sf.id AS fulfillment_id,
              o.id AS order_id,
              o.order_number,
              opd.promised_to::text AS promised_date,
              (opd.promised_to - ${CARRIER_LEAD_DAYS}::int)::text AS due_on,
              ${MEL_DATE("now()")} AS today,
              (sf.status = 'collected') AS at_hub
         FROM public.shop_fulfillment sf
         JOIN public."order" o ON o.id = sf.order_id
         JOIN public.order_package_delivery opd
           ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.carrier_handoff h ON h.shop_fulfillment_id = sf.id
        WHERE o.status = 'paid'
          AND opd.method = 'standard'
          AND opd.promised_to IS NOT NULL
          AND h.id IS NULL
          AND sf.status NOT IN ('withdrawn', 'unfulfillable', 'delivered')
     ) p
     WHERE p.due_on ${cmp} p.today
     ORDER BY p.due_on ASC, p.order_number ASC
     LIMIT 200`,
  );
  return res.rows;
}
