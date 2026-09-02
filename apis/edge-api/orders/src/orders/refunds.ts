/**
 * The refund side of an order, read for back-office (055).
 *
 * ⚠ READS ONLY. Money is issued by `core-api`, because the payment secret lives there and nowhere else
 * (019 SC-012, 055 research R1). This service is where the order console already lives (053), so it is
 * where the console *reads* — the console calls two hosts, which is the honest consequence of "money
 * lives where the secret lives".
 *
 * ⚠ READ IS OPEN TO ANY ACTIVE STAFF INCLUDING `csa` (FR-020). They are the ones being asked about it,
 * and until 053 they could not see a single order they were being asked about.
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
}

/**
 * Every refund against an order, newest first.
 *
 * ⚠ `actor_label` resolves a NAME, never an email — an audit read is not a reason to put a staff
 * member's contact details on a screen. It is a LEFT JOIN because `actor_sub` is a snapshot rather
 * than a foreign key, and because a `system`-issued refund has no person behind it at all.
 *
 * ⚠ 057 — IT NOW JOINS BOTH STAFF TABLES, AND IT HAD TO. `actor_sub` is a Cognito subject from
 * WHICHEVER POOL the actor belongs to. This query only ever joined `admin.staff`, which is correct
 * for `back_office` and matches nothing for anyone else — so the moment a shop manager could issue a
 * refund (US5), every shop-issued refund would have come back with a null label and rendered in the
 * back-office audit trail as a bare em-dash. Not an error, not a warning: silently unattributable, in
 * the one table whose own comment says "an unattributable staff refund is the audit gap this table
 * exists to close."
 *
 * ⚠ The two joins are keyed on `actor_kind` as well as the sub, so they cannot both match. Without
 * that predicate a subject that somehow existed in both pools would make COALESCE pick by join order
 * rather than by fact.
 */
export async function refunds(orderId: string): Promise<RefundRow[]> {
  const res = await query<RefundRow>(
    `SELECT r.id::text AS refund_id, r.kind, r.amount::text, r.reason, r.status,
            r.failure_reason, r.note, r.actor_kind,
            COALESCE(ast.name, sst.name) AS actor_label,
            r.created_at, r.settled_at
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
    `SELECT rl.refund_id::text, rl.order_item_id::text, oi.product_name,
            rl.quantity, rl.amount::text
       FROM public.refund_line rl
       JOIN public.refund r     ON r.id = rl.refund_id
       JOIN public.order_item oi ON oi.id = rl.order_item_id
      WHERE r.order_id = $1`,
    [orderId],
  );
  return res.rows;
}

export interface ProposedRefundRow {
  order_item_id: string;
  product_name: string;
  quantity: number;
  amount: string;
}

/**
 * ⚠ PROPOSED REFUNDS ARE DERIVED, AND THERE IS NO PROPOSALS TABLE (FR-004a, data-model §4).
 *
 * A proposal is a *view of other facts*: a pick shortfall the picker recorded, minus anything already
 * refunded against that line, minus anything a human has dismissed. Storing it would let it disagree
 * with the shortfall it came from — a picker correcting a quantity would leave a stale proposal behind,
 * which FR-004b forbids ("at most once per shortfall, however many times the shortfall is edited").
 * Deriving makes that requirement free instead of a reconciliation job. This is 027's
 * counted-not-stored rule, applied a third time.
 *
 * ⚠ The platform has its OWN STAFF'S EVIDENCE that a customer paid for something they did not receive.
 * Making them ask for it is the failure gap G3 describes. But a payment triggered by a warehouse tap
 * has no second pair of eyes, so this proposes and a person decides (spec A5b).
 *
 * ⚠ GROUPED BY ORDER ITEM, not by shortfall row: one product short across two pick records is one
 * decision, not two.
 */
export async function proposedRefunds(orderId: string): Promise<ProposedRefundRow[]> {
  const res = await query<ProposedRefundRow>(
    `SELECT oi.id::text AS order_item_id,
            oi.product_name,
            SUM(fi.unavailable_quantity)::int AS quantity,
            (SUM(fi.unavailable_quantity) * oi.unit_price_amount)::text AS amount
       FROM public.fulfillment_item fi
       JOIN public.order_item oi        ON oi.id = fi.order_item_id
       JOIN public.shop_fulfillment sf  ON sf.id = fi.shop_fulfillment_id
      WHERE oi.order_id = $1
        AND fi.unavailable_quantity > 0
        -- Already refunded, in whole or in part: only the remainder is still a decision.
        AND fi.unavailable_quantity > COALESCE((
              SELECT SUM(rl.quantity)
                FROM public.refund_line rl
                JOIN public.refund r ON r.id = rl.refund_id
               WHERE rl.order_item_id = oi.id
                 AND r.status IN ('submitting','submitted','succeeded','failed')), 0)
        -- ⚠ A human looked and said no. The ONLY thing about a proposal that is stored, because it is
        -- the one fact the derivation cannot hold.
        AND NOT EXISTS (
              SELECT 1 FROM public.refund_proposal_dismissal d
               WHERE d.shop_fulfillment_id = sf.id AND d.order_item_id = oi.id)
   GROUP BY oi.id, oi.product_name, oi.unit_price_amount
   ORDER BY oi.product_name`,
    [orderId],
  );
  return res.rows;
}

export interface RefundRequestRow {
  request_id: string;
  message: string;
  status: string;
  outcome_note: string | null;
  created_at: Date;
  decided_at: Date | null;
}

/** The customer's own ask, in their own words (FR-005r2). */
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

/** What the customer named in their request. Empty means they asked about the order as a whole. */
export async function refundRequestItems(requestId: string): Promise<RefundRequestItemRow[]> {
  const res = await query<RefundRequestItemRow>(
    `SELECT ri.order_item_id::text, oi.product_name, ri.quantity
       FROM public.refund_request_item ri
       JOIN public.order_item oi ON oi.id = ri.order_item_id
      WHERE ri.request_id = $1
   ORDER BY oi.product_name`,
    [requestId],
  );
  return res.rows;
}

/**
 * Dismiss a proposed refund (FR-004b).
 *
 * ⚠ THE ONLY THING ABOUT A PROPOSAL THAT IS STORED. Everything else is derived on read, because a
 * stored proposal goes stale when a picker corrects a shortfall. A dismissal is the one fact the
 * derivation cannot hold: it is a judgement a person made, not a consequence of other rows.
 *
 * ⚠ NO MONEY MOVES HERE, which is why this lives on the cold path while issuing lives in `core-api`.
 * It records that a human looked and said no — and it records WHO and WHY, because the alternative is
 * a shortfall that silently stops being owed with nobody accountable for the decision.
 *
 * ⚠ Idempotent by primary key. Two operators clearing the same queue must not race into an error;
 * the FIRST dismissal stands, because it is the one that was actually made.
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

/**
 * Which package holds a proposal, so the console need not know about fulfilments.
 *
 * ⚠ The dismissal is keyed on (package, line) rather than (order, line) because a shortfall belongs
 * to a package: the same product short at two shops is two separate judgements.
 */
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
