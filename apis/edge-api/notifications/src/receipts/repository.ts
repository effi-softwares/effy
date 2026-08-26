// The DB half of the receipt drain: claim rows, read the order the receipt describes, mark outcomes.
// 052-order-confirmation-invoice, US3. Raw SQL, no ORM (Principle VI).
import { query, withTransaction } from "@effy/edge-shared";

import type { PendingReceipt, ReceiptDrainDeps } from "./drain";

interface PendingRow {
  id: string;
  order_id: string;
  recipient: string;
  reason: PendingReceipt["reason"];
  attempts: number;
}

/**
 * Claim up to `limit` pending rows.
 *
 * ⚠ `FOR UPDATE SKIP LOCKED` so two overlapping worker invocations never claim the same row — the
 * property that makes a re-run safe without any bookkeeping. Only `pending` rows are claimed, so a
 * row that already reached a terminal status is invisible here forever.
 */
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

/** Everything the template needs, read from the order's own snapshot. */
export interface ReceiptOrderRow {
  order_number: string;
  placed_at: string | null;
  currency: string;
  item_subtotal_amount: string;
  discount_amount: string | null;
  promo_code: string | null;
  delivery_fee_amount: string | null;
  grand_total_amount: string;
  delivery_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  method_type: string | null;
  method_brand: string | null;
  method_last4: string | null;
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
}

/**
 * Read the order a receipt describes. Returns null when it can no longer be read — the drain treats
 * that as `skipped`, not as a failure to retry forever.
 *
 * ⚠ EVERY FIGURE COMES FROM THE ORDER'S OWN SNAPSHOT (FR-011), never from the live catalogue or a
 * re-derived promotion. That is what lets a receipt still explain itself years later.
 */
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
            o.delivery_fee_amount::text  AS delivery_fee_amount,
            o.grand_total_amount::text   AS grand_total_amount,
            o.delivery_address, o.billing_address,
            p.method_type, p.method_brand, p.method_last4
       FROM public."order" o
       LEFT JOIN public.payment p ON p.order_id = o.id
      WHERE o.id = $1`,
    [orderId],
  );
  const order = orderRes.rows[0];
  if (!order) return null;

  const itemsRes = await query<ReceiptItemRow>(
    `SELECT product_name, unit_price_amount::text AS unit_price_amount,
            quantity, line_subtotal_amount::text AS line_subtotal_amount
       FROM public.order_item WHERE order_id = $1 ORDER BY created_at ASC`,
    [orderId],
  );

  // ⚠ `shop_id` is neither selected nor ordered by — the customer must never learn which node handles
  // which package (FR-009). Ordered by the promise so the output is stable and says nothing about
  // internal grouping.
  const arrivalsRes = await query<ReceiptArrivalRow>(
    `SELECT method, promised_from::text AS promised_from, promised_to::text AS promised_to
       FROM public.order_package_delivery
      WHERE order_id = $1
      ORDER BY promised_from ASC NULLS LAST, promised_to ASC NULLS LAST, method ASC`,
    [orderId],
  );

  return { order, items: itemsRes.rows, arrivals: arrivalsRes.rows };
}

/** Build the DB-backed drain deps around an injected sender (so the handler wires the mailer in). */
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
