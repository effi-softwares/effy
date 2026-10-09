// The customer's order history and receipt: SQL only. Every read is scoped to the order's owner
// at the first statement; nothing here selects a shop.
import { pooled, type Queryable } from "@effy/edge-shared";

export interface SummaryRow {
  id: string;
  order_number: string;
  status: string;
  placed_at: string | null;
  item_count: number;
  grand_total_amount: string;
  currency: string;
  /** 079 — who delivers the order, and a courier's timeframe as sold. Both null before 079. */
  delivery_type?: "effy" | "courier" | null;
  courier_estimate?: string | null;
}

export interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  placed_at: string | null;
  delivery_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  // 066 — columns on the order, deliberately NOT keys in the address snapshot.
  delivery_handover: string | null;
  delivery_note: string | null;
  item_subtotal_amount: string;
  discount_amount: string;
  promo_code: string | null;
  delivery_fee_amount: string;
  /**
   * 077 — the delivery charge as the lines the customer was sold, or null on an order placed before
   * 077. ⚠ `delivery_fee_breakdown->'lines'` and NOTHING else from that column: the rest holds a
   * distance and the plan's prices, which a customer must never be sent (FR-032).
   */
  delivery_fee_lines?: { kind: string; amount: string }[] | null;
  grand_total_amount: string;
  currency: string;
  payment_status: string | null;
  /** 074 — points the order was part-paid with (0 = none), their value, and what the card paid. */
  points_used?: number;
  points_value_amount?: string;
  card_paid_amount?: string | null;
  /**
   * 079 — who delivers the order, and a courier's timeframe as it was SOLD. Both null on an order
   * placed before 079. ⚠ Never the reason: a customer is told who delivers, not why (076 FR-023).
   */
  delivery_type?: "effy" | "courier" | null;
  courier_estimate?: string | null;
  /**
   * 080 — what tracking a customer may be shown: how many parcels the order is, how many have gone
   * to a courier, and — only when exactly one has — its link and courier. Never per parcel.
   */
  parcel_count?: number;
  consignments_out?: number;
  only_tracking_url?: string | null;
  only_courier_name?: string | null;
  /**
   * 081 — the LATEST move by back-office, if any: where to, when, and what the customer received.
   * ⚠ Never the staff reason, the courier fee or the difference — the SELECT does not name them.
   */
  moved_to?: "effy" | "courier" | null;
  moved_at?: string | null;
  moved_compensation?: string | null;
  moved_amount_cents?: number | null;
  moved_points?: number | null;
}

export interface ItemRow {
  order_item_id: string;
  product_id: string;
  product_name: string;
  unit_price_amount: string;
  quantity: number;
  line_subtotal_amount: string;
  image_key: string | null;
}

export interface FulfillmentRow {
  /** Used ONLY to attach shortfalls. Not a shop id, and never reaches the wire. */
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

/** ⚠ NO `failure_reason`: the provider's words are staff information, so they are not selected at all. */
export interface RefundRow {
  amount: string;
  status: string;
  settled_at: string | null;
  /** 074 — optional so a fake built before 074 still type-checks; the SQL always selects them. */
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
       o.delivery_type AS delivery_type, o.courier_estimate AS courier_estimate
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
       o.delivery_fee_amount::text AS delivery_fee_amount,
       o.delivery_fee_breakdown -> 'lines' AS delivery_fee_lines,
       o.grand_total_amount::text AS grand_total_amount, o.currency AS currency,
       (SELECT status FROM public.payment WHERE order_id = o.id) AS payment_status,
       o.points_used AS points_used, o.points_value_amount::text AS points_value_amount,
       (SELECT amount::text FROM public.payment WHERE order_id = o.id) AS card_paid_amount,
       o.delivery_type AS delivery_type, o.courier_estimate AS courier_estimate,
       -- 080 — the parcels still on their way to the customer (a withdrawn or unsupplied portion is not one).
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
-- 081 — the latest move by back-office. ⚠ Only these five columns: never the reason, the fee or the difference.
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

    // The line image comes from the LIVE catalogue while every other column is the order's own
    // immutable snapshot: a renamed or re-priced product must still show what was bought, but a
    // photograph is decoration and the current one is the useful one.
    // ⚠ LEFT JOIN, never INNER: a product with no primary image must still produce its line.
    items: (orderId) =>
      rows<ItemRow>(
        `
SELECT oi.id::text AS order_item_id,
       oi.product_id::text AS product_id, oi.product_name AS product_name,
       oi.unit_price_amount::text AS unit_price_amount, oi.quantity AS quantity,
       oi.line_subtotal_amount::text AS line_subtotal_amount,
       pm.storage_key AS image_key
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

    // ⚠ THE TERMINAL-STATUS PREDICATE IS THE WHOLE POINT, and it is in the SQL: a shop may flag an
    // item unavailable and un-flag it when it turns up, and a customer watching live would see it
    // vanish and reappear. They are told a settled fact, per portion, or nothing (020 SC-017).
    shortfalls: (orderId) =>
      rows<ShortfallRow>(
        `
SELECT fi.shop_fulfillment_id::text AS shop_fulfillment_id,
       oi.product_name              AS product_name,
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

    // ⚠ `shop_id` is neither selected nor ordered by. The rows are ordered by the promise itself, so
    // the output is stable and says nothing about internal grouping (052 FR-009).
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

    // ⚠ `submitting` IS INCLUDED here, unlike in the ceiling: this asks "what has happened to your
    // money", and a refund asked for and not yet confirmed is something the shopper should see.
    refunds: (orderId) =>
      rows<RefundRow>(
        `
SELECT amount::text        AS amount,
       status              AS status,
       settled_at::text    AS settled_at,
       -- 074 — how it was made up. NULL card_amount (a pre-074 row) means all of it went to the card.
       COALESCE(card_amount, amount)::text AS card_amount,
       points_returned     AS points_returned
FROM public.refund
WHERE order_id = $1
ORDER BY created_at DESC, id DESC`,
        [orderId],
      ),
  };
}
