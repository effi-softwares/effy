/**
 * What a valid refund is (055; moved from the retired Go backend by 070). No HTTP, no SQL.
 *
 * ⚠ ONE SERVICE, EVERY AUDIENCE. Back-office, a shop manager and a customer's own cancellation
 * differ only in how the actor is resolved and what they may ask for; once an intent exists the
 * rules are identical. Two copies of "what a valid refund is" would drift, and the drift is money.
 */
import { announceOrder } from "../../live";
import { createHash } from "node:crypto";

import type { Queryable } from "../../lib/db";
import { emitMetric } from "../../lib/metrics";
import { formatCents, parseCents } from "../../lib/money";
import { RefusedError, type PaymentGateway, type Refund, type WebhookEvent } from "../gateway";
import {
  AlreadyCancelledError, AmountInvalidError, AmountRejectedError, InvalidActorKindError, InvalidReasonError,
  MessageRequiredError, NoLinesError, NoteRequiredError, ProviderRefusedError, RefundOrderNotFoundError, RequestNotFoundError,
} from "./errors";
import type { CancelInput, InsertLine, LineInput, RefundRepository } from "./repository";
import {
  OPERATOR_REASONS, REASON_GOODWILL, REFUND_SUBMITTED, REFUND_SUBMITTING, REFUND_SUCCEEDED, settledStatus,
} from "./state";

/** Kept in step with `MONEY_METRIC_NAMESPACE` in `../index.ts` (not imported: that file imports this one). */
const MONEY_METRIC_NAMESPACE = "Effy/Commerce";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IssueInput {
  orderId: string;
  kind: string; // "item" | "goodwill"
  reason: string;
  note: string;
  lines: readonly LineInput[];
  /** Goodwill only. Supplied beside lines it is REJECTED, never ignored. */
  amount: string;
  actorSub: string;
  /**
   * ⚠ WHICH ORGANISATION IS SPENDING THE MONEY — REQUIRED, never defaulted. A call site that forgot
   * it would record a shop's refund as back-office work, and the audit trail would name the wrong
   * organisation with nothing failing.
   */
  actorKind: string;
  /**
   * A shop is the one issuer that knows whether the goods are fit to sell, so for a shop stock goes
   * back ONLY when they asked. Back-office keeps the automatic behaviour (false).
   */
  skipStockReturn?: boolean;
}

export interface IssueResult {
  refundId: string;
  amount: string;
  /** ⚠ NEVER "refunded". The provider has it; the bank has not moved anything and may refuse. */
  status: string;
  remainingAmount?: string;
  /**
   * ⚠ TRUE WHEN THE PROVIDER NEVER ANSWERED — the refund may or may not exist. Not a failure, not
   * a success. An operator told nothing would assume it worked or issue it again.
   */
  stalled?: true;
}

export interface CancelResult {
  refundId?: string;
  amount?: string;
  status: string;
  stalled?: true;
}

/**
 * ⚠ The kinds a HUMAN request may claim. `system` means the provider acted with nobody behind it;
 * a customer never issues a refund, they request one. Anything else is a programming error.
 */
const ISSUER_KINDS: ReadonlySet<string> = new Set(["back_office", "shop"]);

/**
 * Derived from the ACTION, never random — and it is BOTH our uniqueness constraint and the key sent
 * to the provider, so an ambiguous retry is recognised as the same request instead of creating a
 * second refund. ⚠ Byte-identical to the key the retired backend derived, so an action retried
 * across the cut-over still resolves to one refund.
 */
export function refundIdempotencyKey(input: Pick<IssueInput, "orderId" | "kind" | "reason" | "lines">, amountCents: number): string {
  const h = createHash("sha256").update(`refund:${input.orderId}:${input.kind}:${input.reason}:${amountCents}`);
  for (const l of input.lines) h.update(`:${l.orderItemId} x${l.quantity}`);
  return h.digest("hex");
}

/**
 * Stable per order, so two simultaneous cancels refund once. ⚠ No actor and no amount: a customer
 * tapping cancel while staff cancel the same order on the phone must produce ONE refund.
 */
export const cancelIdempotencyKey = (orderId: string) => `cancel:${orderId}`;

export function validateIssue(input: IssueInput): void {
  if (!ISSUER_KINDS.has(input.actorKind)) throw new InvalidActorKindError();
  if (!OPERATOR_REASONS.has(input.reason)) throw new InvalidReasonError();
  if (input.kind === "goodwill") {
    if (input.reason !== REASON_GOODWILL) throw new InvalidReasonError();
    // An amount with no line and no explanation is unaccountable.
    if (input.note === "") throw new NoteRequiredError();
  } else if (input.kind === "item") {
    if (input.reason === REASON_GOODWILL) throw new InvalidReasonError();
    if (input.lines.length === 0) throw new NoLinesError();
    // ⚠ REJECTED rather than ignored: beside a line selection the two could disagree, and the
    // record would claim a refund covered items it did not.
    if (input.amount !== "") throw new AmountRejectedError();
  } else {
    throw new InvalidReasonError();
  }
}

/**
 * A free amount typed by an operator.
 *
 * ⚠ MORE THAN TWO DECIMAL PLACES IS REFUSED, not truncated: "12.345" must not silently refund
 * $12.34. ⚠ More than $100,000 is a typo, not an intent.
 */
export function goodwillCents(amount: string): number {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new AmountInvalidError();
  let cents: number;
  try {
    cents = parseCents(trimmed);
  } catch {
    throw new AmountInvalidError();
  }
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_00) throw new AmountInvalidError();
  return cents;
}

/**
 * ⚠ SMALL ON PURPOSE. This runs inside a person's request over a control that moves money. Two
 * attempts covers a dropped connection; anything beyond that is not a blip, and the reconciler
 * (070) picks it up within minutes rather than leaving someone watching a spinner.
 */
const MAX_SUBMIT_ATTEMPTS = 2;

const MAX_REQUEST_MESSAGE = 2000;

export function createRefundService(deps: { repo: RefundRepository; gateway: PaymentGateway; namespace?: () => string }) {
  const { repo, gateway } = deps;
  // ⚠ Not the calling service's namespace — see MONEY_METRIC_NAMESPACE.
  const ns = deps.namespace ?? (() => MONEY_METRIC_NAMESPACE);

  /**
   * Send the refund, retrying an AMBIGUOUS failure under the SAME key — which is what makes the
   * retry safe: one that did reach the provider returns the original refund. ⚠ A definite refusal
   * is never retried.
   */
  async function submit(refundId: string, paymentIntentId: string, amountCents: number, key: string): Promise<Refund> {
    let last: unknown;
    for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
      try {
        return await gateway.createRefund({
          paymentIntentId, amountCents, idempotencyKey: key,
          // ⚠ The only reason ever sent. `fraudulent` blocklists the payer; `duplicate` is a claim
          // the platform cannot substantiate.
          reason: "requested_by_customer",
          metadata: { effy_refund_id: refundId },
        });
      } catch (err) {
        if (err instanceof RefusedError) throw err;
        last = err;
      }
    }
    throw last;
  }

  /** Best-effort follow-up: the money is already on its way and nothing here may un-say that. */
  const quietly = (work: Promise<unknown>) => work.catch(() => undefined);

  return {
    repo,

    /**
     * Record a refund, then submit it.
     *
     * ⚠ RECORD FIRST, THEN SUBMIT. The reverse loses money on any crash between the two: the
     * customer is refunded, the platform has no record, the ceiling is wrong, and it can happen
     * again. Recording first makes the worst case a row left `submitting` — visible, bounded, and
     * resolved by the reconciler.
     */
    async issue(input: IssueInput): Promise<IssueResult> {
      validateIssue(input);
      if (!UUID.test(input.orderId)) throw new RefundOrderNotFoundError();

      let amountCents: number;
      let lines: InsertLine[] = [];
      if (input.kind === "goodwill") {
        amountCents = goodwillCents(input.amount);
      } else {
        if (input.lines.some((l) => !UUID.test(l.orderItemId))) throw new RefundOrderNotFoundError();
        // ⚠ COMPUTED from the receipt's lines, never from the request.
        ({ totalCents: amountCents, lines } = await repo.priceLines(input.orderId, input.lines));
      }

      const key = refundIdempotencyKey(input, amountCents);
      const rec = await repo.record({
        orderId: input.orderId, kind: input.kind, amountCents, currency: "AUD", reason: input.reason,
        note: input.note === "" ? null : input.note, idempotencyKey: key,
        actorKind: input.actorKind, actorSub: input.actorSub, lines,
      });
      const remaining = rec.paid.paidCents - rec.paid.refundedCents;

      if (!rec.issued) {
        // ⚠ A SUCCESS THAT CHANGED NOTHING — a double-click must not look like a failure — reporting
        // the row's REAL state.
        return {
          refundId: rec.refundId, status: rec.existingStatus, amount: formatCents(amountCents), remainingAmount: formatCents(remaining),
          ...(rec.existingStatus === REFUND_SUBMITTING ? { stalled: true as const } : {}),
        };
      }

      let provider: Refund;
      try {
        provider = await submit(rec.refundId, rec.paid.paymentIntentId, amountCents, key);
      } catch (err) {
        if (err instanceof RefusedError) {
          // A DECISION. Terminal.
          await quietly(repo.markRefused(rec.refundId, err.reason));
          emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "refused" });
          throw new ProviderRefusedError(err.reason, rec.refundId);
        }
        // ⚠ AMBIGUOUS. The row stays `submitting`: not refused (nobody decided) and not counted (it
        // may never have landed). And it is said out loud.
        emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "ambiguous" });
        return { refundId: rec.refundId, status: REFUND_SUBMITTING, stalled: true, amount: formatCents(amountCents) };
      }

      await quietly(repo.markSubmitted(rec.refundId, provider.id));
      emitMetric(ns(), "RefundsIssued", 1, { kind: input.kind });

      // Put the units back — item-derived only, and only if the issuer did not decline it.
      if (input.kind === "item" && !input.skipStockReturn) await quietly(repo.returnStock(rec.refundId, input.orderId));
      // A shopper who asked has now been answered.
      await quietly(repo.closeOpenRequestForOrder(input.orderId, input.actorSub));
      // 071 — the customer's order page, the shops' and back-office's now show a refund.
      await announceOrder(input.orderId, { db: repo.db });

      return {
        refundId: rec.refundId, amount: formatCents(amountCents), status: REFUND_SUBMITTED,
        remainingAmount: formatCents(remaining - amountCents),
      };
    },

    /**
     * Call off an order and return everything paid — INCLUDING delivery: nothing was delivered.
     *
     * ⚠ CANCELLATION *IS* A FULL REFUND. Payment is captured the moment an order exists, so there
     * is no free cancellation; there is only returning money already taken.
     * ⚠ Already cancelled is a success (`AlreadyCancelledError` is absorbed): a double-tap must not
     * look like a failure, and the order genuinely is cancelled.
     */
    async cancel(input: CancelInput): Promise<CancelResult> {
      if (!UUID.test(input.orderId)) throw new RefundOrderNotFoundError();
      let locked: Awaited<ReturnType<RefundRepository["cancelOrder"]>>;
      try {
        locked = await repo.cancelOrder(input);
      } catch (err) {
        if (err instanceof AlreadyCancelledError) return { status: REFUND_SUCCEEDED };
        throw err;
      }

      // 071 — THE ORDER IS CANCELLED FROM HERE, whatever becomes of the refund below (it may be
      // refused, or stall). So this is announced now, once, before any of those outcomes: the shops
      // stop packing, a driver holding it sees it go, a same-day place is freed, and the customer's
      // page says cancelled. The refund's own later fate is announced when it is known.
      await announceOrder(input.orderId, { slots: true, drivers: true, db: repo.db });

      // ⚠ WHAT REMAINS, NOT WHAT WAS PAID: an order already partly refunded must not be refunded
      // its full total.
      const amountCents = locked.paidCents - locked.refundedCents;
      if (amountCents <= 0) return { amount: formatCents(0), status: REFUND_SUCCEEDED };

      const key = cancelIdempotencyKey(input.orderId);
      const refundId = await repo.recordCancellationRefund(input, amountCents, key);
      if (!refundId) return { amount: formatCents(amountCents), status: REFUND_SUBMITTING, stalled: true };

      let provider: Refund;
      try {
        provider = await submit(refundId, locked.paymentIntentId, amountCents, key);
      } catch (err) {
        if (err instanceof RefusedError) {
          await quietly(repo.markRefused(refundId, err.reason));
          emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "refused" });
          // ⚠ THE ORDER STAYS CANCELLED: the shops have been told to stop. The refund is now a
          // separate, visible problem staff must resolve.
          throw new ProviderRefusedError(err.reason, refundId);
        }
        emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "ambiguous" });
        emitMetric(ns(), "OrdersCancelled", 1, { actor: input.actorKind });
        return { refundId, amount: formatCents(amountCents), status: REFUND_SUBMITTING, stalled: true };
      }

      await quietly(repo.markSubmitted(refundId, provider.id));
      emitMetric(ns(), "RefundsIssued", 1, { kind: "cancellation" });
      emitMetric(ns(), "OrdersCancelled", 1, { actor: input.actorKind });
      return { refundId, amount: formatCents(amountCents), status: REFUND_SUBMITTED };
    },

    /**
     * A customer's ASK against their own order. ⚠ It moves no money: a form that withdrew money on
     * submission would let anyone refund their own order by describing a problem.
     */
    async raiseRequest(input: { orderId: string; customerId: string; message: string; items: readonly LineInput[] }): Promise<string> {
      const message = input.message.trim().slice(0, MAX_REQUEST_MESSAGE);
      if (message === "") throw new MessageRequiredError();
      if (!UUID.test(input.orderId)) throw new RefundOrderNotFoundError();
      // A named line that is not an id cannot be one of this order's lines; it is dropped, as an
      // id that matches nothing always was.
      const requestId = await repo.insertRequest(input.orderId, input.customerId, message, input.items.filter((i) => UUID.test(i.orderItemId)));
      // 071 — back-office's order console gains a request to decide; the customer's own page shows
      // it was received. No shop screen shows a request, so no shop is told.
      await announceOrder(input.orderId, { shops: false, db: repo.db });
      return requestId;
    },

    /** Close a request without money moving. ⚠ Not emailed: the order screen is where the shopper looks. */
    async declineRequest(requestId: string, note: string, decidedBy: string): Promise<void> {
      if (!UUID.test(requestId)) throw new RequestNotFoundError();
      const orderId = await repo.decideRequest(requestId, "declined", note, decidedBy);
      await announceOrder(orderId, { shops: false, db: repo.db });
    },

    /**
     * The provider's side of a refund's life, applied INSIDE the webhook's transaction.
     *
     * ⚠ A REFUND IS A STATE MACHINE, NOT A CALL. `issue` records `submitted`; the bank can still
     * reject it thirty days later, and this is how the platform finds out.
     */
    async handleRefundEvent(tx: Queryable, evt: WebhookEvent): Promise<{ recognised: boolean; changed: boolean }> {
      if (!evt.refundId) return { recognised: false, changed: false };
      const status = settledStatus(evt.refundStatus);
      if (!status) return { recognised: true, changed: false }; // the provider is still working

      if (await repo.settleByProviderId(tx, evt.refundId, status, evt.failureReason ?? "")) {
        // The counter that tells the truth: issued fires at submission, this when the outcome lands.
        emitMetric(ns(), "RefundOutcomes", 1, { outcome: status });
        return { recognised: true, changed: true };
      }
      // ⚠ NOT CHANGED means one of two very different things: already terminal (ordinary), or THE
      // PLATFORM HAS NO ROW FOR IT AT ALL.
      if (await repo.knowsProviderRefund(tx, evt.refundId)) return { recognised: true, changed: false };

      // ⚠ RECORDED, NEVER DISCARDED. A refund made by hand in the provider's dashboard is real;
      // dropping it leaves the order claiming money it no longer holds, refundable a second time.
      await repo.recordUnattributedRefund(tx, evt);
      emitMetric(ns(), "RefundsIssued", 1, { kind: "external" });
      return { recognised: false, changed: true };
    },

    /**
     * RESOLVE REFUNDS LEFT UNCERTAIN (070 FR-024). A refund whose submission got no answer used to
     * stay `submitting` indefinitely, with nothing looking at it again.
     *
     * For each one: ASK THE PROVIDER whether it exists. If it does, record that. If it does not,
     * submit it under the key stored on the row — never a new one.
     *
     * ⚠ Stock is NOT returned here. Whether the issuer wanted it returned is not recorded on the
     * row, and inventing stock is worse than not returning it.
     */
    async reconcile(opts: { olderThanSeconds?: number; stuckAfterSeconds?: number; limit?: number } = {}) {
      const stuck = await repo.stuckSubmitting(opts.olderThanSeconds ?? 120, opts.limit ?? 25);
      const outcomes = { found: 0, resubmitted: 0, refused: 0, unresolved: 0 };

      for (const r of stuck) {
        try {
          const existing = (await gateway.listRefunds(r.paymentIntentId)).find((p) => p.metadata.effy_refund_id === r.id);
          let provider = existing;
          if (!provider) {
            // ⚠ A stalled refund does not hold the ceiling, so staff may since have refunded the
            // order another way. Sending this one now would return more than was paid. It is
            // closed as refused — by the platform, and the reason says so.
            if (r.amountCents > (await repo.remainingCents(r.orderId, r.id))) {
              await repo.markRefused(r.id, "not submitted: the order no longer has this much left to refund");
              outcomes.refused++;
              await announceOrder(r.orderId, { db: repo.db });
              continue;
            }
            provider = await gateway.createRefund({
              paymentIntentId: r.paymentIntentId, amountCents: r.amountCents, idempotencyKey: r.idempotencyKey,
              reason: "requested_by_customer", metadata: { effy_refund_id: r.id },
            });
          }
          await repo.markSubmitted(r.id, provider.id);
          // The provider may already know how it ended.
          const settled = settledStatus(provider.status);
          if (settled) await repo.settleByProviderId(repo.db, provider.id, settled, provider.failureReason);
          await quietly(repo.closeOpenRequestForOrder(r.orderId, r.actorSub ?? "system"));
          outcomes[existing ? "found" : "resubmitted"]++;
          await announceOrder(r.orderId, { db: repo.db }); // 071 — a refund that was uncertain now has an answer
        } catch (err) {
          if (err instanceof RefusedError) {
            await quietly(repo.markRefused(r.id, err.reason));
            outcomes.refused++;
            await announceOrder(r.orderId, { db: repo.db });
          } else {
            outcomes.unresolved++; // still unknown; the next run asks again
          }
        }
      }

      for (const [outcome, n] of Object.entries(outcomes)) if (n > 0) emitMetric(ns(), "RefundsReconciled", n, { outcome });
      const stuckCount = await repo.countSubmittingOlderThan(opts.stuckAfterSeconds ?? 900);
      // Emitted every run, zero included, so an alarm on it has data when all is well.
      emitMetric(ns(), "RefundsStuck", stuckCount, {});
      return { ...outcomes, stuck: stuckCount };
    },
  };
}

export type RefundService = ReturnType<typeof createRefundService>;
