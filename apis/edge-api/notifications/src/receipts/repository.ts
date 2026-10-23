import { query, withTransaction } from "@effy/edge-shared";

import type { PendingReceipt, ReceiptDrainDeps } from "./drain";

interface PendingRow {
  id: string;
  order_id: string;
  recipient: string;
  reason: PendingReceipt["reason"];
  attempts: number;
}

/** `FOR UPDATE SKIP LOCKED`, pending rows only, so overlapping runs never claim the same row. */
async function claimPending(limit: number): Promise<PendingReceipt[]> {
  return withTransaction(async (tx) => {
    const res = await tx.query<PendingRow>(
      `SELECT id, order_id, recipient, reason, attempts
         FROM public.receipt_dispatch
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      recipient: r.recipient,
      reason: r.reason,
      attempts: r.attempts,
    }));
  });
}

async function markSent(id: string, messageId: string | undefined): Promise<void> {
  await query(
    `UPDATE public.receipt_dispatch
        SET status='sent', message_id=$2, processed_at=now()
      WHERE id=$1`,
    [id, messageId ?? null],
  );
}

async function markSkipped(id: string, reason: string): Promise<void> {
  await query(
    `UPDATE public.receipt_dispatch
        SET status='skipped', last_error=$2, processed_at=now()
      WHERE id=$1`,
    [id, reason],
  );
}

async function markRetry(id: string, error: string): Promise<void> {
  await query(`UPDATE public.receipt_dispatch SET attempts=attempts+1, last_error=$2 WHERE id=$1`, [
    id,
    error,
  ]);
}

async function markFailed(id: string, error: string): Promise<void> {
  await query(
    `UPDATE public.receipt_dispatch
        SET status='failed', attempts=attempts+1, last_error=$2, processed_at=now()
      WHERE id=$1`,
    [id, error],
  );
}

/** Read from the order's own snapshot. */
export interface ReceiptOrderRow {
  order_number: string;
  placed_at: string | null;
  currency: string;
  item_subtotal_amount: string;
  discount_amount: string | null;
  promo_code: string | null;
  /** Delivery promotions' share, and every promotion's headline as sold. */
  delivery_discount_amount?: string | null;
  promotion_names?: string[] | null;
  delivery_fee_amount: string | null;
  /** Only the `lines` key: the rest is pricing, never mailed. */
  delivery_fee_lines: { kind: string; amount: string }[];
  /** As sold; never the reason. */
  delivery_type: "effy" | "courier";
  courier_estimate?: string | null;
  /** Null for a courier order. */
  delivery_promise?: "window" | "day" | "asap" | null;
  asap_estimate?: string | null;
  grand_total_amount: string;
  delivery_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  method_type: string | null;
  method_brand: string | null;
  method_last4: string | null;
  points_used?: number;
  points_value_amount?: string;
  card_paid_amount?: string | null;
}

export interface ReceiptItemRow {
  product_name: string;
  unit_price_amount: string;
  quantity: number;
  line_subtotal_amount: string;
}

export interface ReceiptArrivalRow {
  method: string;
  promised_from: string | null;
  promised_to: string | null;
  /** The window the customer was sold. */
  window_start: Date | null;
  window_end: Date | null;
}

/** Null when unreadable (the drain skips it). Every figure is the order's own snapshot. */
export async function loadReceipt(orderId: string): Promise<{
  order: ReceiptOrderRow;
  items: ReceiptItemRow[];
  arrivals: ReceiptArrivalRow[];
} | null> {
  const orderRes = await query<ReceiptOrderRow>(
    `SELECT o.order_number, o.placed_at::text AS placed_at, o.currency,
            o.item_subtotal_amount::text AS item_subtotal_amount,
            o.discount_amount::text      AS discount_amount,
            o.promo_code,
            o.delivery_discount_amount::text AS delivery_discount_amount,
            (SELECT array_agg(COALESCE(op.headline, op.name) ORDER BY op.name) FROM public.order_promotion op WHERE op.order_id = o.id) AS promotion_names,
            o.delivery_fee_amount::text  AS delivery_fee_amount,
            o.delivery_fee_breakdown -> 'lines' AS delivery_fee_lines,
            o.delivery_type, o.courier_estimate, o.delivery_promise, o.asap_estimate,
            o.grand_total_amount::text   AS grand_total_amount,
            o.delivery_address, o.billing_address,
            p.method_type, p.method_brand, p.method_last4,
            o.points_used, o.points_value_amount::text AS points_value_amount, p.amount::text AS card_paid_amount
       FROM public."order" o
       LEFT JOIN public.payment p ON p.order_id = o.id
      WHERE o.id = $1`,
    [orderId],
  );
  const order = orderRes.rows[0];
  if (!order) return null;

  const itemsRes = await query<ReceiptItemRow>(
    `SELECT CASE WHEN variant_label IS NULL THEN product_name ELSE product_name || ' — ' || variant_label END AS product_name, unit_price_amount::text AS unit_price_amount,
            quantity, line_subtotal_amount::text AS line_subtotal_amount
       FROM public.order_item WHERE order_id = $1 ORDER BY created_at ASC`,
    [orderId],
  );

  // No `shop_id`: ordered by the promise, so nothing reveals internal grouping.
  const arrivalsRes = await query<ReceiptArrivalRow>(
    `SELECT method, promised_from::text AS promised_from, promised_to::text AS promised_to,
            window_start, window_end
       FROM public.order_package_delivery
      WHERE order_id = $1
      ORDER BY promised_from ASC NULLS LAST, window_start ASC NULLS LAST, promised_to ASC NULLS LAST, method ASC`,
    [orderId],
  );

  return { order, items: itemsRes.rows, arrivals: arrivalsRes.rows };
}

export function receiptRepositoryDeps(
  sender: Pick<ReceiptDrainDeps, "send" | "mailerConfigured">,
  opts: { maxAttempts: number; batchSize: number },
): ReceiptDrainDeps {
  return {
    mailerConfigured: sender.mailerConfigured,
    maxAttempts: opts.maxAttempts,
    batchSize: opts.batchSize,
    claimPending,
    send: sender.send,
    markSent,
    markSkipped,
    markRetry,
    markFailed,
  };
}
