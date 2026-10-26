// Every read is scoped to the owner at the first statement; nothing here selects a shop.
import { pooled, renditionWidthsSql, type Queryable } from "@effy/edge-shared";
import type { DeliveryPromise } from "@effy/shared-types";

export interface SummaryRow {
  id: string;
  order_number: string;
  status: string;
  placed_at: string | null;
  item_count: number;
  grand_total_amount: string;
  currency: string;
  delivery_type: "effy" | "courier";
  courier_estimate?: string | null;
  /** Null for a courier order. */
  delivery_promise?: DeliveryPromise | null;
  asap_estimate?: string | null;
  /** Input to the stage word; never sent to a client. */
  portion_statuses?: string[] | null;
  /** The first four lines' pictures, keys and widths from one subquery so they cannot mispair. */
  image_refs?: { key: string | null; widths: number[] | null }[] | null;
  arrivals?: ArrivalRow[] | null;
  delivered_at?: string | null;
  refunds?: Pick<RefundRow, "amount" | "status" | "settled_at">[] | null;
}

export interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  placed_at: string | null;
  delivery_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  delivery_handover: string | null;
  delivery_note: string | null;
  item_subtotal_amount: string;
  discount_amount: string;
  promo_code: string | null;
  delivery_discount_amount: string;
  promotions: { headline: string | null; name: string; code: string | null; goods: string; delivery: string }[] | null;
  delivery_fee_amount: string;
  /** Only `->'lines'`: the rest holds distance and plan prices a customer must never see. */
  delivery_fee_lines: { kind: string; amount: string }[];
  grand_total_amount: string;
  currency: string;
  payment_status: string | null;
  points_used?: number;
  points_value_amount?: string;
  card_paid_amount?: string | null;
  /** Never the reason: a customer is told who delivers, not why. */
  delivery_type: "effy" | "courier";
  courier_estimate?: string | null;
  /** Null for a courier order. */
  delivery_promise?: DeliveryPromise | null;
  asap_estimate?: string | null;
  /** Tracking: a link and courier only when exactly one parcel has gone. Never per parcel. */
  parcel_count?: number;
  consignments_out?: number;
  only_tracking_url?: string | null;
  only_courier_name?: string | null;
  /** The latest staff move, without its reason, fee or difference. */
  moved_to?: "effy" | "courier" | null;
  moved_at?: string | null;
  moved_compensation?: string | null;
  moved_amount_cents?: number | null;
  moved_points?: number | null;
}

export interface ItemRow {
  order_item_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  /** As sold. */
  variant_label: string | null;
  age_restricted: boolean;
  unit_price_amount: string;
  quantity: number;
  line_subtotal_amount: string;
  discount_amount: string;
  image_key: string | null;
  image_widths: number[] | null;
}

export interface FulfillmentRow {
  /** Only to attach shortfalls; never reaches the wire. */
  id: string;
  status: string;
  item_count: number;
  subtotal_amount: string;
}

export interface ShortfallRow {
  shop_fulfillment_id: string;
  product_name: string;
  quantity: number;
}

export interface ArrivalRow {
  method: string;
  promised_from: string | null;
  promised_to: string | null;
  window_start: Date | null;
  window_end: Date | null;
}

export interface MethodRow {
  method_type: string | null;
  method_brand: string | null;
  method_last4: string | null;
}

/** No `failure_reason`: the provider's words are for staff. */
export interface RefundRow {
  amount: string;
  status: string;
  settled_at: string | null;
  card_amount?: string;
  points_returned?: number;
}

export interface OrdersRepository {
  list(customerId: string): Promise<SummaryRow[]>;
  get(customerId: string, orderId: string): Promise<OrderRow | null>;
  items(orderId: string): Promise<ItemRow[]>;
  fulfillments(orderId: string): Promise<FulfillmentRow[]>;
  shortfalls(orderId: string): Promise<ShortfallRow[]>;
  arrivals(orderId: string): Promise<ArrivalRow[]>;
  paymentMethod(orderId: string): Promise<MethodRow | null>;
  refunds(orderId: string): Promise<RefundRow[]>;
}

export function createOrdersRepository(db: Queryable = pooled): OrdersRepository {
  const rows = async <R extends object>(sql: string, args: unknown[]) => (await db.query<R & Record<string, unknown>>(sql, args)).rows as R[];

  return {
    list: (customerId) =>
      rows<SummaryRow>(
        `
SELECT o.id::text AS id, o.order_number AS order_number, o.status AS status,
       o.placed_at::text AS placed_at,
       COALESCE((SELECT SUM(quantity) FROM public.order_item WHERE order_id = o.id), 0)::int AS item_count,
       o.grand_total_amount::text AS grand_total_amount, o.currency AS currency,
       o.delivery_type AS delivery_type, o.courier_estimate AS courier_estimate,
       o.delivery_promise AS delivery_promise, o.asap_estimate AS asap_estimate,
       -- The order list's pictures, stage and status line. ⚠ Each is the SAME read the receipt
       -- makes (same tables, same order), gathered per order; nothing here selects a shop.
       ARRAY(SELECT sf.status FROM public.shop_fulfillment sf WHERE sf.order_id = o.id) AS portion_statuses,
       (SELECT json_agg(json_build_object('key', x.k, 'widths', x.w))
          FROM (SELECT pm.storage_key AS k, ${renditionWidthsSql("pm.storage_key")} AS w
                  FROM public.order_item oi
                  LEFT JOIN public.product_media pm ON pm.product_id = oi.product_id AND pm.is_primary
                 WHERE oi.order_id = o.id
                 ORDER BY oi.created_at ASC
                 LIMIT 4) x) AS image_refs,
       (SELECT json_agg(json_build_object(
                   'method', d.method, 'promised_from', d.promised_from::text, 'promised_to', d.promised_to::text,
                   'window_start', d.window_start, 'window_end', d.window_end)
                 ORDER BY d.promised_from ASC NULLS LAST, d.window_start ASC NULLS LAST, d.promised_to ASC NULLS LAST, d.method ASC)
          FROM public.order_package_delivery d WHERE d.order_id = o.id) AS arrivals,
       (SELECT max(pa.arrived_at)
          FROM public.package_arrival pa
          JOIN public.shop_fulfillment sf ON sf.id = pa.shop_fulfillment_id
         WHERE sf.order_id = o.id)::text AS delivered_at,
       (SELECT json_agg(json_build_object('amount', r.amount::text, 'status', r.status, 'settled_at', r.settled_at::text))
          FROM public.refund r WHERE r.order_id = o.id) AS refunds
FROM public."order" o
WHERE o.customer_id = $1
ORDER BY o.created_at DESC`,
        [customerId],
      ),

    async get(customerId, orderId) {
      return (
        (
          await rows<OrderRow>(
            `
SELECT o.id::text AS id, o.order_number AS order_number, o.status AS status,
       o.placed_at::text AS placed_at, o.delivery_address AS delivery_address,
       o.billing_address AS billing_address,
       o.delivery_handover AS delivery_handover, o.delivery_note AS delivery_note,
       o.item_subtotal_amount::text AS item_subtotal_amount,
       o.discount_amount::text AS discount_amount, o.promo_code AS promo_code,
       o.delivery_discount_amount::text AS delivery_discount_amount,
       (SELECT json_agg(json_build_object('headline', op.headline, 'name', op.name, 'code', op.code_text,
                                          'goods', op.goods_amount::text, 'delivery', op.delivery_amount::text) ORDER BY op.name)
          FROM public.order_promotion op WHERE op.order_id = o.id) AS promotions,
       o.delivery_fee_amount::text AS delivery_fee_amount,
       o.delivery_fee_breakdown -> 'lines' AS delivery_fee_lines,
       o.grand_total_amount::text AS grand_total_amount, o.currency AS currency,
       (SELECT status FROM public.payment WHERE order_id = o.id) AS payment_status,
       o.points_used AS points_used, o.points_value_amount::text AS points_value_amount,
       (SELECT amount::text FROM public.payment WHERE order_id = o.id) AS card_paid_amount,
       o.delivery_type AS delivery_type, o.courier_estimate AS courier_estimate,
       o.delivery_promise AS delivery_promise, o.asap_estimate AS asap_estimate,
       -- The parcels still on their way to the customer (a withdrawn or unsupplied portion is not one).
       (SELECT count(*) FROM public.shop_fulfillment sf
         WHERE sf.order_id = o.id AND sf.status NOT IN ('withdrawn', 'unfulfillable'))::int AS parcel_count,
       out.n AS consignments_out,
       CASE WHEN out.n = 1 THEN out.url END AS only_tracking_url,
       CASE WHEN out.n = 1 THEN out.courier END AS only_courier_name,
       mv.to_type AS moved_to, mv.created_at::text AS moved_at, mv.compensation AS moved_compensation,
       mv.amount_cents AS moved_amount_cents, mv.points AS moved_points
FROM public."order" o
-- ⚠ A consignment counts once the parcel is WITH the courier: a booking is not yet something to track.
CROSS JOIN LATERAL (
  SELECT count(*)::int AS n, max(cc.tracking_url) AS url, max(cs.courier_name) AS courier
    FROM public.courier_consignment cc
    JOIN public.shop_fulfillment sf ON sf.id = cc.shop_fulfillment_id
    JOIN public.courier_service cs ON cs.id = cc.courier_service_id
   WHERE sf.order_id = o.id AND cc.state NOT IN ('booked', 'cancelled')
) out
-- The latest move by back-office. ⚠ Only these five columns: never the reason, the fee or the difference.
LEFT JOIN LATERAL (
  SELECT x.to_type, x.created_at, x.compensation, x.amount_cents, x.points
    FROM public.delivery_override x
   WHERE x.order_id = o.id
   ORDER BY x.created_at DESC, x.id DESC
   LIMIT 1
) mv ON true
WHERE o.id = $1 AND o.customer_id = $2`,
            [orderId, customerId],
          )
        )[0] ?? null
      );
    },

    // The picture comes from the live catalogue while everything else is the order's snapshot. Left
    // join: a product without a picture still produces its line.
    items: (orderId) =>
      rows<ItemRow>(
        `
SELECT oi.id::text AS order_item_id,
       oi.product_id::text AS product_id, oi.product_name AS product_name,
       oi.variant_id::text AS variant_id, oi.variant_label AS variant_label,
       COALESCE((SELECT p.age_restricted FROM public.product p WHERE p.id = oi.product_id), false) AS age_restricted,
       oi.unit_price_amount::text AS unit_price_amount, oi.quantity AS quantity,
       oi.line_subtotal_amount::text AS line_subtotal_amount,
       oi.discount_amount::text AS discount_amount,
       pm.storage_key AS image_key,
       ${renditionWidthsSql("pm.storage_key")} AS image_widths
FROM public.order_item oi
LEFT JOIN public.product_media pm ON pm.product_id = oi.product_id AND pm.is_primary
WHERE oi.order_id = $1 ORDER BY oi.created_at ASC`,
        [orderId],
      ),

    fulfillments: (orderId) =>
      rows<FulfillmentRow>(
        `
SELECT id::text AS id, status AS status, item_count AS item_count, subtotal_amount::text AS subtotal_amount
FROM public.shop_fulfillment WHERE order_id = $1 ORDER BY created_at ASC`,
        [orderId],
      ),

    // Only settled shortfalls, so an item flagged and un-flagged never flickers for the customer.
    shortfalls: (orderId) =>
      rows<ShortfallRow>(
        `
SELECT fi.shop_fulfillment_id::text AS shop_fulfillment_id,
       -- A shortfall names what was SOLD, label included ("Basmati Rice — 1 kg").
       CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' — ' || oi.variant_label END AS product_name,
       fi.unavailable_quantity      AS quantity
FROM public.fulfillment_item fi
JOIN public.shop_fulfillment sf ON sf.id = fi.shop_fulfillment_id
JOIN public.order_item oi       ON oi.id = fi.order_item_id
WHERE sf.order_id = $1
  AND sf.status IN ('ready_for_pickup', 'collected')
  AND fi.unavailable_quantity > 0
ORDER BY oi.product_name ASC`,
        [orderId],
      ),

    // Ordered by the promise, not the shop, so the output says nothing about grouping.
    arrivals: (orderId) =>
      rows<ArrivalRow>(
        `
SELECT method AS method,
       promised_from::text AS promised_from,
       promised_to::text   AS promised_to,
       window_start        AS window_start,
       window_end          AS window_end
FROM public.order_package_delivery
WHERE order_id = $1
ORDER BY promised_from ASC NULLS LAST, window_start ASC NULLS LAST, promised_to ASC NULLS LAST, method ASC`,
        [orderId],
      ),

    async paymentMethod(orderId) {
      return (
        (await rows<MethodRow>(
          `SELECT method_type AS method_type, method_brand AS method_brand, method_last4 AS method_last4
             FROM public.payment WHERE order_id = $1`,
          [orderId],
        ))[0] ?? null
      );
    },

    // Includes `submitting`, unlike the ceiling: a requested refund is something the shopper sees.
    refunds: (orderId) =>
      rows<RefundRow>(
        `
SELECT amount::text        AS amount,
       status              AS status,
       settled_at::text    AS settled_at,
       -- How it was made up. NULL card_amount (a refund issued outside Effy) went entirely to the card.
       COALESCE(card_amount, amount)::text AS card_amount,
       points_returned     AS points_returned
FROM public.refund
WHERE order_id = $1
ORDER BY created_at DESC, id DESC`,
        [orderId],
      ),
  };
}
