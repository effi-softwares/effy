/**
 * 113 FR-005: a payment that went through for an order that had already ended unpaid (abandoned or failed). The
 * customer can't see that order, so nobody may keep their money: the whole card amount goes back, by the system,
 * recorded like every refund and submitted after the commit (`submitRecorded`; `refundReconcile` resolves an
 * uncertain one). With the clean-up cancelling the payment first this should never happen - it is the safety net,
 * and it raises an alarm (`UnplacedPaymentRefunded`).
 */

import type { Queryable } from "../../lib/db";
import { emitMetric } from "../../lib/metrics";
import { MONEY_METRIC_NAMESPACE } from "../index";
import { recordUnplacedRefund } from "./repository";

/** Inside the webhook's transaction. Returns the refund to submit after the commit, or null (nothing to return, or already recorded). */
export async function refundUnplaced(tx: Queryable, orderId: string, intentId: string): Promise<string | null> {
  // The money was taken: the payment row says so, then the refund says it went back.
  const paid = (
    await tx.query<{ amount: string; currency: string }>(
      `UPDATE public.payment p SET status = 'succeeded', updated_at = now()
         FROM public."order" o
        WHERE p.order_id = $1 AND o.id = p.order_id AND o.status IN ('abandoned', 'failed')
        RETURNING p.amount::text AS amount, p.currency`,
      [orderId],
    )
  ).rows[0];
  if (!paid || Number(paid.amount) <= 0) return null;

  // The refund row through the table's one writer (repository.ts).
  const refundId = await recordUnplacedRefund(tx, { orderId, amount: paid.amount, currency: paid.currency, intentId });
  if (!refundId) return null;

  emitMetric(MONEY_METRIC_NAMESPACE, "UnplacedPaymentRefunded", 1);
  return refundId;
}
