/**
 * The payment provider's notifications (070 FR-023).
 *
 * ⚠ AN EVENT IS RECORDED AS HANDLED IN THE SAME TRANSACTION THAT HANDLES IT. The backend this
 * replaces recorded the event first, in its own statement, and then processed it: a transient
 * failure in the processing left the event marked seen, the provider's retry was discarded as a
 * duplicate, and the notification was lost for good. For a payment the shopper's return to the site
 * usually recovered it; for a refund the bank rejected a month later, nothing did.
 *
 * Here the record and the effects commit together or not at all. If handling throws, nothing is
 * recorded, the provider is answered with a failure, and its retry is processed.
 *
 * ⚠ The transaction's first statement is the insert into `stripe_event`. Two deliveries of one
 * event race on that primary key: one inserts, the other waits, sees the row, and does nothing.
 */
import {
  emitMetric, metricNamespace, withTransaction, type Queryable, type RequestScope, type Transactor,
} from "@effy/edge-shared";
import { announceOrderOfProviderRefund } from "@effy/edge-shared/live";
import {
  announcePaid, finalizeFailed, finalizeSucceeded, meterFinalize,
  type FinalizeOutcome, type PaymentGateway, type WebhookEvent,
} from "@effy/edge-shared/payments";

import { findOrderByIntent } from "../checkout/store";

export type WebhookOutcome = "handled" | "duplicate" | "ignored";

/** Applies a `refund.*` event inside the webhook's transaction. */
export type RefundEventHandler = (tx: Queryable, evt: WebhookEvent) => Promise<void>;

export function createWebhookHandler(deps: {
  gateway: PaymentGateway;
  refunds: RefundEventHandler;
  /** After a payment has COMMITTED: record how it was paid, best-effort. */
  afterPaid: (scope: Pick<RequestScope, "log">, orderId: string, intentId: string) => Promise<void>;
  /** 071 — after a refund's outcome has committed. Defaults to telling the order's audience. */
  afterRefund?: (providerRefundId: string) => Promise<void>;
  transact?: Transactor;
}) {
  const transact = deps.transact ?? withTransaction;

  /**
   * Verify, deduplicate and apply one notification.
   * Throws `WebhookSignatureError` for an invalid signature; any other throw means "not handled,
   * send it again".
   */
  return async function handle(scope: Pick<RequestScope, "log">, rawBody: string | Buffer, signature: string): Promise<WebhookOutcome> {
    const evt = await deps.gateway.constructWebhookEvent(rawBody, signature);

    // An event type this platform does not act on. Acknowledged; nothing recorded.
    if (evt.paymentIntentId === "" && !evt.refundId) return count(evt, "ignored");

    let paid: { orderId: string; out: FinalizeOutcome } | null = null;
    let refundSettled: string | null = null;
    let outcome: WebhookOutcome;
    try {
      outcome = await transact(async (tx) => {
        const first = await tx.query(
          `INSERT INTO public.stripe_event (event_id, type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
          [evt.id, evt.type],
        );
        if ((first.rowCount ?? 0) === 0) return "duplicate";

        // A refund is keyed on its OWN id — an order can have several, and each has its own fate.
        if (evt.refundId) {
          await deps.refunds(tx, evt);
          refundSettled = evt.refundId;
          return "handled";
        }

        const orderId = await findOrderByIntent(tx, evt.paymentIntentId);
        if (!orderId) return "handled"; // an intent that is not one of ours

        if (evt.intentStatus === "succeeded") {
          paid = { orderId, out: await finalizeSucceeded(tx, orderId) };
        } else if (evt.intentStatus === "failed") {
          await finalizeFailed(tx, orderId);
        }
        return "handled";
      });
    } catch (err) {
      count(evt, "failed");
      throw err;
    }

    // ⚠ Only now — the transaction has committed. An outcome that rolled back did not happen.
    const settled = paid as { orderId: string; out: FinalizeOutcome } | null;
    if (settled) {
      meterFinalize(metricNamespace(), settled.out);
      await announcePaid(settled.out);
      await deps.afterPaid(scope, settled.orderId, evt.paymentIntentId);
    }
    // 071 — the bank's verdict on a refund changes the customer's order page ("on its way" →
    // "completed", or "there was a problem") and back-office's. Announced after the commit, like
    // everything else here; a duplicate delivery returned above without setting this.
    const settledRefund = refundSettled as string | null;
    if (settledRefund) {
      await (deps.afterRefund ?? announceOrderOfProviderRefund)(settledRefund);
    }
    return count(evt, outcome);
  };
}

function count<T extends WebhookOutcome | "failed">(evt: WebhookEvent, outcome: T): T {
  // The provider's own event type: a small closed vocabulary, safe as a dimension.
  emitMetric(metricNamespace(), "WebhookEvents", 1, { type: evt.type, outcome });
  // ⚠ The same failure again with NO dimensions, because that is what an alarm can watch: the
  // metric above is one series per event type, and an alarm cannot sum series it must discover.
  if (outcome === "failed") emitMetric(metricNamespace(), "WebhookFailures");
  return outcome;
}
