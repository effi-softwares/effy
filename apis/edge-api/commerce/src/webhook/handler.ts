/**
 * An event is recorded as handled in the same transaction that handles it, starting with the
 * `stripe_event` insert: a duplicate delivery waits on its primary key and does nothing, and a
 * failure records nothing, so the provider's retry is processed.
 */
import {
  emitMetric, metricNamespace, withTransaction, type Queryable, type RequestScope, type Transactor,
} from "@effy/edge-shared";
import { announceOrderOfProviderRefund } from "@effy/edge-shared/live";
import {
  announcePaid, finalizeSucceeded, meterFinalize, refundUnplaced,
  type FinalizeOutcome, type PaymentGateway, type WebhookEvent,
} from "@effy/edge-shared/payments";

import { findOrderByIntent } from "../checkout/store";

export type WebhookOutcome = "handled" | "duplicate" | "ignored";

export type RefundEventHandler = (tx: Queryable, evt: WebhookEvent) => Promise<void>;

export function createWebhookHandler(deps: {
  gateway: PaymentGateway;
  refunds: RefundEventHandler;
  /** After the payment commits; best-effort. */
  afterPaid: (scope: Pick<RequestScope, "log">, orderId: string, intentId: string) => Promise<void>;
  afterRefund?: (providerRefundId: string) => Promise<void>;
  /** 113: sends a late-payment refund recorded in the event's transaction, after it commits. */
  submitRefund?: (refundId: string) => Promise<unknown>;
  transact?: Transactor;
}) {
  const transact = deps.transact ?? withTransaction;

  /** Throws `WebhookSignatureError` for a bad signature; any other throw means "send it again". */
  return async function handle(scope: Pick<RequestScope, "log">, rawBody: string | Buffer, signature: string): Promise<WebhookOutcome> {
    const evt = await deps.gateway.constructWebhookEvent(rawBody, signature);

    // Not an event we act on: acknowledged, nothing recorded.
    if (evt.paymentIntentId === "" && !evt.refundId) return count(evt, "ignored");

    let paid: { orderId: string; out: FinalizeOutcome } | null = null;
    let lateRefund: string | null = null;
    let refundSettled: string | null = null;
    let outcome: WebhookOutcome;
    try {
      outcome = await transact(async (tx) => {
        const first = await tx.query(
          `INSERT INTO public.stripe_event (event_id, type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
          [evt.id, evt.type],
        );
        if ((first.rowCount ?? 0) === 0) return "duplicate";

        // Keyed on the refund's own id: an order can have several.
        if (evt.refundId) {
          await deps.refunds(tx, evt);
          refundSettled = evt.refundId;
          return "handled";
        }

        const orderId = await findOrderByIntent(tx, evt.paymentIntentId);
        if (!orderId) return "handled";

        if (evt.intentStatus === "succeeded") {
          const out = await finalizeSucceeded(tx, orderId);
          paid = { orderId, out };
          // 113 FR-005: the order had already ended unpaid (abandoned, or its payment cancelled), so nobody may keep
          // the money - it goes back in full. A redelivery records nothing twice (keyed on the intent).
          if (!out.applied) lateRefund = await refundUnplaced(tx, orderId, evt.paymentIntentId);
        } else if (evt.intentStatus === "failed") {
          // 113 FR-006a: a declined card is not the end of the order. The customer can try again on the same screen,
          // and a later success places it; only the unpaid-orders clean-up (or a cancelled payment) ends it.
          await tx.query(
            `UPDATE public.payment SET status = 'failed', updated_at = now()
              WHERE order_id = $1 AND status <> 'succeeded'`,
            [orderId],
          );
        }
        return "handled";
      });
    } catch (err) {
      count(evt, "failed");
      throw err;
    }

    // Only after the commit: an outcome that rolled back did not happen.
    const settled = paid as { orderId: string; out: FinalizeOutcome } | null;
    if (settled) {
      meterFinalize(metricNamespace(), settled.out);
      await announcePaid(settled.out);
      await deps.afterPaid(scope, settled.orderId, evt.paymentIntentId);
    }
    const late = lateRefund as string | null;
    if (late && deps.submitRefund) {
      try {
        await deps.submitRefund(late);
      } catch (err) {
        // Recorded as submitting: refundReconcile sends it.
        scope.log.warn({ err, refundId: late }, "checkout: late-payment refund left for the reconciler");
      }
    }
    const settledRefund = refundSettled as string | null;
    if (settledRefund) {
      await (deps.afterRefund ?? announceOrderOfProviderRefund)(settledRefund);
    }
    return count(evt, outcome);
  };
}

function count<T extends WebhookOutcome | "failed">(evt: WebhookEvent, outcome: T): T {
  emitMetric(metricNamespace(), "WebhookEvents", 1, { type: evt.type, outcome });
  // Again with no dimensions, which is what an alarm can watch.
  if (outcome === "failed") emitMetric(metricNamespace(), "WebhookFailures");
  return outcome;
}
