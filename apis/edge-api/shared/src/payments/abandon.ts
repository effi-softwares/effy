/**
 * 113: the one way to close an order nobody paid for - the unpaid-orders clean-up (commerce) and closing an account
 * (customer). The provider is asked first, outside any transaction: the order is closed only once its payment can no
 * longer be taken (FR-002), and a payment that went through is never left without its order.
 *
 * ⚠ `settlePaid` is commerce's: it places the order and runs commerce's post-payment steps. The customer service passes
 * none, so "it paid just now" comes back as `paid` and closure is refused; the webhook places it (research R5).
 */

import { pooled, withTransaction, type Queryable, type Transactor } from "../lib/db";
import { announceStockChange, meterStockHoldsEnded } from "../stock/announce";
import { finalizeAbandoned, type AbandonOutcome } from "./finalize";
import type { IntentStatus, PaymentGateway } from "./gateway";

export type AbandonResult =
  /** Closed; its holds are free. */
  | "abandoned"
  /** The provider says it was paid: settled now (commerce), or left to the webhook (no `settlePaid`). */
  | "paid"
  /** The customer is mid-payment (an authentication step, or processing): left alone, asked again next time. */
  | "in_progress"
  /** The provider couldn't be asked: left alone. */
  | "unreachable"
  /** No longer awaiting payment (paid, failed or already closed): nothing to do. */
  | "gone";

export interface AbandonDeps {
  gateway: Pick<PaymentGateway, "cancelPaymentIntent">;
  transact?: Transactor;
  q?: Queryable;
  /** Places an order whose payment went through. Commerce only. */
  settlePaid?: (orderId: string) => Promise<unknown>;
  now?: () => Date;
}

export interface AbandonReport {
  result: AbandonResult;
  /** Present when `result === "abandoned"`: who to tell, and whether their points moved. */
  outcome?: AbandonOutcome;
}

export async function abandonOrder(deps: AbandonDeps, orderId: string): Promise<AbandonReport> {
  const q = deps.q ?? pooled;
  const transact = deps.transact ?? withTransaction;
  const now = deps.now ?? (() => new Date());

  const row = (
    await q.query<{ status: string; intent: string | null }>(
      `SELECT o.status,
              (SELECT p.stripe_payment_intent_id FROM public.payment p WHERE p.order_id = o.id) AS intent
         FROM public."order" o WHERE o.id = $1`,
      [orderId],
    )
  ).rows[0];
  if (!row || row.status !== "pending_payment") return { result: "gone" };

  // No intent: the checkout never reached the provider (or paid with points only and was placed at once).
  if (row.intent) {
    let status: IntentStatus;
    try {
      status = await deps.gateway.cancelPaymentIntent(row.intent);
    } catch {
      return { result: "unreachable" };
    }
    if (status === "succeeded") {
      if (deps.settlePaid) await deps.settlePaid(orderId);
      return { result: "paid" };
    }
    if (status !== "canceled") return { result: "in_progress" };
  }

  const outcome = await transact((tx) => finalizeAbandoned(tx, orderId, now()));
  if (outcome.applied) {
    // 114: after the commit - its checkout stock is back on sale, and the shops and back-office are told.
    const r = outcome.stockReleased;
    meterStockHoldsEnded("abandoned", { live: r.released - r.lapsed, lapsed: r.lapsed });
    await announceStockChange(r.shopIds);
  }
  return outcome.applied ? { result: "abandoned", outcome } : { result: "gone" };
}
