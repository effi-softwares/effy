// Back-office order reads (053 US1). Raw SQL, no ORM (Principle VI).
//
// ⚠ THIS IS THE FIRST TIME ANYONE AT EFFY CAN LOOK AT AN ORDER. There has never been an order list
// or an order detail in any internal console, which is why a customer told "contact support and
// we'll sort it out" (020 FR-018b) reached people who could not see what they were being asked about.

import type { OrderAwaiting } from "@effy/shared-types";

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
}

export interface ListParams {
  q?: string;
  status?: string;
  awaiting?: OrderAwaiting;
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
            COALESCE(p.statuses, ARRAY[]::text[]) AS statuses
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
                   array_agg(sf.status ORDER BY sf.status) AS statuses
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
  payment_status: string | null;
  method_type: string | null;
  method_brand: string | null;
  method_last4: string | null;
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
            pay.status AS payment_status,
            pay.method_type, pay.method_brand, pay.method_last4
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
}

export async function packages(orderId: string): Promise<PackageRow[]> {
  const res = await query<PackageRow>(
    `SELECT sf.id AS fulfillment_id, sf.shop_id, s.name AS shop_name, sf.status,
            sf.item_count, sf.subtotal_amount::text, opd.method,
            h.reference AS handoff_reference, h.carrier_name AS handoff_carrier,
            h.handed_over_at AS handoff_at, h.recorded_by_sub AS handoff_by, h.note AS handoff_note,
            pa.arrived_at AS arrival_at, pa.source AS arrival_source,
            pa.recorded_by_sub AS arrival_by, pa.note AS arrival_note
       FROM public.shop_fulfillment sf
       JOIN public.shop s ON s.id = sf.shop_id
  LEFT JOIN public.order_package_delivery opd
         ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
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
 * Sources: `fulfillment_event` (020, the shop's picking), `driver_task_event` (049, collection and
 * delivery), `carrier_handoff` and `package_arrival` (053).
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
                ELSE fe.event_type
              END AS summary,
              NULL::text AS actor_sub,
              fe.shop_fulfillment_id AS fulfillment_id
         FROM public.fulfillment_event fe
         JOIN pkg ON pkg.id = fe.shop_fulfillment_id

       UNION ALL

       SELECT dte.at,
              'driver'::text,
              'Driver: ' || dte.status,
              NULL::text,
              COALESCE(ct.shop_fulfillment_id, dtp.shop_fulfillment_id)
         FROM public.driver_task_event dte
    LEFT JOIN public.collection_task ct ON ct.id = dte.collection_task_id
    LEFT JOIN public.delivery_task_package dtp ON dtp.delivery_task_id = dte.delivery_task_id
        WHERE COALESCE(ct.shop_fulfillment_id, dtp.shop_fulfillment_id) IN (SELECT id FROM pkg)

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
