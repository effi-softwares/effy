/**
 * The refund side of an order, read for back-office by any active staff. Issuing lives in
 * `@effy/edge-shared/payments`; the only write here is dismissing a proposal, which moves no money.
 */

import { query } from "@effy/edge-shared";

export interface RefundRow {
  refund_id: string;
  kind: string;
  amount: string;
  reason: string;
  status: string;
  failure_reason: string | null;
  note: string | null;
  actor_kind: string;
  actor_label: string | null;
  created_at: Date;
  settled_at: Date | null;
  /** The card part and the points that came back. */
  card_amount?: string | null;
  points_returned?: number;
}

/**
 * Newest first. `actor_label` is a name, never an email. `actor_sub` can be a back-office or shop
 * subject, so both staff tables are joined, each keyed on `actor_kind` too, so only one can match.
 */
export async function refunds(orderId: string): Promise<RefundRow[]> {
  const res = await query<RefundRow>(
    `SELECT r.id::text AS refund_id, r.kind, r.amount::text, r.reason, r.status,
            r.failure_reason, r.note, r.actor_kind,
            COALESCE(ast.name, sst.name) AS actor_label,
            r.created_at, r.settled_at,
            COALESCE(r.card_amount, r.amount)::text AS card_amount, r.points_returned
       FROM public.refund r
       LEFT JOIN admin.staff ast
              ON ast.cognito_sub = r.actor_sub AND r.actor_kind = 'back_office'
       LEFT JOIN public.shop_staff sst
              ON sst.cognito_sub = r.actor_sub AND r.actor_kind = 'shop'
      WHERE r.order_id = $1
   ORDER BY r.created_at DESC, r.id DESC`,
    [orderId],
  );
  return res.rows;
}

export interface RefundLineRow {
  refund_id: string;
  order_item_id: string;
  product_name: string;
  quantity: number;
  amount: string;
}

export async function refundLines(orderId: string): Promise<RefundLineRow[]> {
  const res = await query<RefundLineRow>(
    `SELECT rl.refund_id::text, rl.order_item_id::text,
            -- The line as sold, with its variant.
            CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' - ' || oi.variant_label END AS product_name,
            rl.quantity, rl.amount::text
       FROM public.refund_line rl
       JOIN public.refund r     ON r.id = rl.refund_id
       JOIN public.order_item oi ON oi.id = rl.order_item_id
      WHERE r.order_id = $1`,
    [orderId],
  );
  return res.rows;
}

/** The derivation lives in `@effy/edge-shared`, shared with the shop's Today. */
export type { ProposedRefundRow } from "@effy/edge-shared";
export { proposedRefunds } from "@effy/edge-shared";

export interface RefundRequestRow {
  request_id: string;
  message: string;
  status: string;
  outcome_note: string | null;
  created_at: Date;
  decided_at: Date | null;
}

export async function refundRequest(orderId: string): Promise<RefundRequestRow | null> {
  const res = await query<RefundRequestRow>(
    `SELECT id::text AS request_id, message, status, outcome_note, created_at, decided_at
       FROM public.refund_request
      WHERE order_id = $1
   ORDER BY created_at DESC
      LIMIT 1`,
    [orderId],
  );
  return res.rows[0] ?? null;
}

export interface RefundRequestItemRow {
  order_item_id: string;
  product_name: string;
  quantity: number;
}

/** Empty means the whole order. */
export async function refundRequestItems(requestId: string): Promise<RefundRequestItemRow[]> {
  const res = await query<RefundRequestItemRow>(
    `SELECT ri.order_item_id::text, CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' - ' || oi.variant_label END AS product_name, ri.quantity
       FROM public.refund_request_item ri
       JOIN public.order_item oi ON oi.id = ri.order_item_id
      WHERE ri.request_id = $1
   ORDER BY oi.product_name`,
    [requestId],
  );
  return res.rows;
}

/**
 * The only stored fact about a proposal (everything else is derived): who said it is not owed, and
 * why. Idempotent by primary key; the first dismissal stands.
 */
export async function dismissProposal(input: {
  shopFulfillmentId: string;
  orderItemId: string;
  dismissedBy: string;
  reason: string;
}): Promise<{ created: boolean }> {
  const res = await query(
    `INSERT INTO public.refund_proposal_dismissal
        (shop_fulfillment_id, order_item_id, dismissed_by, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (shop_fulfillment_id, order_item_id) DO NOTHING`,
    [input.shopFulfillmentId, input.orderItemId, input.dismissedBy, input.reason],
  );
  return { created: (res.rowCount ?? 0) > 0 };
}

/** Keyed on (package, line): the same product short at two shops is two judgements. */
export async function fulfillmentForProposal(
  orderId: string,
  orderItemId: string,
): Promise<string | null> {
  const res = await query<{ id: string }>(
    `SELECT sf.id::text
       FROM public.fulfillment_item fi
       JOIN public.shop_fulfillment sf ON sf.id = fi.shop_fulfillment_id
       JOIN public.order_item oi       ON oi.id = fi.order_item_id
      WHERE oi.order_id = $1 AND oi.id = $2 AND fi.unavailable_quantity > 0
      LIMIT 1`,
    [orderId, orderItemId],
  );
  return res.rows[0]?.id ?? null;
}
