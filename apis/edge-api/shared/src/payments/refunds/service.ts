/**
 * What a valid refund is. No HTTP, no SQL. One service for every audience (back-office, shop manager,
 * customer cancellation): they differ only in how the actor is resolved and what they may ask for.
 */
import { announceOrder } from "../../live";
import { announcePointsForOrder } from "../../points/announce";
import { createHash } from "node:crypto";

import type { Queryable } from "../../lib/db";
import { emitMetric } from "../../lib/metrics";
import { formatCents, parseCents } from "../../lib/money";
import { RefusedError, type PaymentGateway, type Refund, type WebhookEvent } from "../gateway";
import {
  AlreadyCancelledError, AmountInvalidError, AmountRejectedError, InvalidActorKindError, InvalidReasonError,
  MessageRequiredError, NoLinesError, NoteRequiredError, ProviderRefusedError, RefundOrderNotFoundError, RequestNotFoundError,
} from "./errors";
import { splitFor, type CancelInput, type InsertLine, type LineInput, type RefundRepository } from "./repository";
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
  /** Goodwill only. Supplied beside lines it is rejected. */
  amount: string;
  actorSub: string;
  /** Which organisation is spending the money. Required, never defaulted, so the audit trail names the right one. */
  actorKind: string;
  /** For a shop, stock goes back only when they ask (they know whether goods are fit to sell). */
  skipStockReturn?: boolean;
}

export interface IssueResult {
  refundId: string;
  amount: string;
  /** The part returned to the card, and the points returned. */
  cardAmount?: string;
  pointsReturned?: number;
  /** Never "refunded": the provider has it, and the bank may refuse. */
  status: string;
  remainingAmount?: string;
  /** True when the provider never answered: the refund may or may not exist. */
  stalled?: true;
}

export interface CancelResult {
  refundId?: string;
  amount?: string;
  cardAmount?: string;
  pointsReturned?: number;
  status: string;
  stalled?: true;
}

/** The kinds a human request may claim. `system` is the provider acting alone; customers request, never issue. */
const ISSUER_KINDS: ReadonlySet<string> = new Set(["back_office", "shop"]);

/** Derived from the action, never random: both our uniqueness constraint and the provider's key, so an ambiguous retry is the same request. */
export function refundIdempotencyKey(input: Pick<IssueInput, "orderId" | "kind" | "reason" | "lines">, amountCents: number): string {
  const h = createHash("sha256").update(`refund:${input.orderId}:${input.kind}:${input.reason}:${amountCents}`);
  for (const l of input.lines) h.update(`:${l.orderItemId} x${l.quantity}`);
  return h.digest("hex");
}

/** Stable per order, with no actor or amount, so a customer and staff cancelling together refund once. */
export const cancelIdempotencyKey = (orderId: string) => `cancel:${orderId}`;

export function validateIssue(input: IssueInput): void {
  if (!ISSUER_KINDS.has(input.actorKind)) throw new InvalidActorKindError();
  if (!OPERATOR_REASONS.has(input.reason)) throw new InvalidReasonError();
  if (input.kind === "goodwill") {
    if (input.reason !== REASON_GOODWILL) throw new InvalidReasonError();
    if (input.note === "") throw new NoteRequiredError();
  } else if (input.kind === "item") {
    if (input.reason === REASON_GOODWILL) throw new InvalidReasonError();
    if (input.lines.length === 0) throw new NoLinesError();
    // Rejected rather than ignored: beside lines the two could disagree.
    if (input.amount !== "") throw new AmountRejectedError();
  } else {
    throw new InvalidReasonError();
  }
}

/** A free amount typed by an operator. More than two decimals is refused, not truncated; over $100,000 is a typo. */
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

/** Small on purpose: a person is waiting. Two attempts cover a dropped connection; the reconciler handles the rest. */
const MAX_SUBMIT_ATTEMPTS = 2;

const MAX_REQUEST_MESSAGE = 2000;

export function createRefundService(deps: { repo: RefundRepository; gateway: PaymentGateway; namespace?: () => string }) {
  const { repo, gateway } = deps;
  const ns = deps.namespace ?? (() => MONEY_METRIC_NAMESPACE);

  /** Sends the refund, retrying an ambiguous failure under the same key. A refusal is never retried. */
  async function submit(refundId: string, paymentIntentId: string, amountCents: number, key: string): Promise<Refund> {
    let last: unknown;
    for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
      try {
        return await gateway.createRefund({
          paymentIntentId, amountCents, idempotencyKey: key,
          // The only reason ever sent.
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

  /** Best-effort follow-up: the money is already on its way. */
  const quietly = (work: Promise<unknown>) => work.catch(() => undefined);

  return {
    repo,

    /**
     * Records a refund, then submits it. The reverse would lose money on a crash between the two;
     * this way the worst case is a `submitting` row the reconciler resolves.
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
        // Computed from the receipt's lines, never from the request.
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
        // A success that changed nothing (a double-click), reporting the row's real state.
        return {
          refundId: rec.refundId, status: rec.existingStatus, amount: formatCents(amountCents), remainingAmount: formatCents(remaining),
          ...(rec.existingStatus === REFUND_SUBMITTING ? { stalled: true as const } : {}),
        };
      }

      const split = rec.split;
      const splitFields = split.points > 0 ? { cardAmount: formatCents(split.cardCents), pointsReturned: split.points } : {};

      // No card part: already recorded `succeeded` with the points returned.
      if (split.cardCents === 0) {
        emitMetric(ns(), "RefundsIssued", 1, { kind: input.kind });
        emitMetric(ns(), "PointsReturned", 1);
        if (input.kind === "item" && !input.skipStockReturn) await quietly(repo.returnStock(rec.refundId, input.orderId));
        await quietly(repo.closeOpenRequestForOrder(input.orderId, input.actorSub));
        await announceOrder(input.orderId, { db: repo.db });
        await announcePointsForOrder(input.orderId, repo.db);
        return {
          refundId: rec.refundId, amount: formatCents(amountCents), status: REFUND_SUCCEEDED,
          remainingAmount: formatCents(remaining - amountCents), ...splitFields,
        };
      }

      let provider: Refund;
      try {
        // Only the card part reaches the provider.
        provider = await submit(rec.refundId, rec.paid.paymentIntentId, split.cardCents, key);
      } catch (err) {
        if (err instanceof RefusedError) {
          await quietly(repo.markRefused(rec.refundId, err.reason));
          emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "refused" });
          throw new ProviderRefusedError(err.reason, rec.refundId);
        }
        // Ambiguous: the row stays `submitting` (not refused, not counted), and it is said out loud.
        emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "ambiguous" });
        return { refundId: rec.refundId, status: REFUND_SUBMITTING, stalled: true, amount: formatCents(amountCents), ...splitFields };
      }

      // The points part comes back with the submission.
      await quietly(repo.markSubmitted(rec.refundId, provider.id));
      emitMetric(ns(), "RefundsIssued", 1, { kind: input.kind });
      if (split.points > 0) {
        emitMetric(ns(), "PointsReturned", 1);
        await announcePointsForOrder(input.orderId, repo.db);
      }

      // Units back: item-derived only, unless the issuer declined.
      if (input.kind === "item" && !input.skipStockReturn) await quietly(repo.returnStock(rec.refundId, input.orderId));
      await quietly(repo.closeOpenRequestForOrder(input.orderId, input.actorSub));
      await announceOrder(input.orderId, { db: repo.db });

      return {
        refundId: rec.refundId, amount: formatCents(amountCents), status: REFUND_SUBMITTED,
        remainingAmount: formatCents(remaining - amountCents), ...splitFields,
      };
    },

    /**
     * Sends a refund recorded inside another flow's transaction, after it committed: the card part
     * under the row's key, retried once, then the points part back. Already sent or card-free: reports
     * the real state. A refusal is recorded and returned, not thrown.
     */
    async submitRecorded(refundId: string): Promise<{ status: string; stalled?: true }> {
      const r = await repo.recordedForSubmit(refundId);
      if (!r) {
        const row = (await repo.db.query<{ status: string }>(`SELECT status FROM public.refund WHERE id = $1`, [refundId])).rows[0];
        return { status: row?.status ?? REFUND_SUBMITTING };
      }
      let provider: Refund;
      try {
        provider = await submit(r.id, r.paymentIntentId, r.cardCents, r.idempotencyKey);
      } catch (err) {
        if (err instanceof RefusedError) {
          await quietly(repo.markRefused(r.id, err.reason));
          emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "refused" });
          await announceOrder(r.orderId, { db: repo.db });
          return { status: "refused" };
        }
        emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "ambiguous" });
        return { status: REFUND_SUBMITTING, stalled: true };
      }
      await quietly(repo.markSubmitted(r.id, provider.id));
      emitMetric(ns(), "RefundsIssued", 1, { kind: "delivery" });
      if (r.pointsReturned > 0) {
        emitMetric(ns(), "PointsReturned", 1);
        await announcePointsForOrder(r.orderId, repo.db);
      }
      await announceOrder(r.orderId, { db: repo.db });
      return { status: REFUND_SUBMITTED };
    },

    /**
     * Calls off an order and returns everything paid, delivery included. Payment is captured when the
     * order exists, so cancellation is a full refund. Already cancelled is a success.
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

      // The order is cancelled from here whatever becomes of the refund, so it is announced now; the
      // refund's own fate is announced when known.
      await announceOrder(input.orderId, { slots: true, drivers: true, db: repo.db });

      // What remains, not what was paid: the order may be partly refunded.
      const amountCents = locked.paidCents - locked.refundedCents;
      if (amountCents <= 0) return { amount: formatCents(0), status: REFUND_SUCCEEDED };

      const key = cancelIdempotencyKey(input.orderId);
      // Split between card and points in proportion.
      const split = splitFor(locked, amountCents);
      const splitFields = split.points > 0 ? { cardAmount: formatCents(split.cardCents), pointsReturned: split.points } : {};
      const refundId = await repo.recordCancellationRefund(input, amountCents, key, split);
      if (!refundId) return { amount: formatCents(amountCents), status: REFUND_SUBMITTING, stalled: true };

      // Points-only: everything came back as points already.
      if (split.cardCents === 0) {
        emitMetric(ns(), "RefundsIssued", 1, { kind: "cancellation" });
        emitMetric(ns(), "OrdersCancelled", 1, { actor: input.actorKind });
        emitMetric(ns(), "PointsReturned", 1);
        await announcePointsForOrder(input.orderId, repo.db);
        return { refundId, amount: formatCents(amountCents), status: REFUND_SUCCEEDED, ...splitFields };
      }

      let provider: Refund;
      try {
        provider = await submit(refundId, locked.paymentIntentId, split.cardCents, key);
      } catch (err) {
        if (err instanceof RefusedError) {
          await quietly(repo.markRefused(refundId, err.reason));
          emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "refused" });
          // The order stays cancelled; the refund is a separate problem for staff.
          throw new ProviderRefusedError(err.reason, refundId);
        }
        emitMetric(ns(), "RefundSubmitFailures", 1, { failure: "ambiguous" });
        emitMetric(ns(), "OrdersCancelled", 1, { actor: input.actorKind });
        return { refundId, amount: formatCents(amountCents), status: REFUND_SUBMITTING, stalled: true };
      }

      await quietly(repo.markSubmitted(refundId, provider.id));
      emitMetric(ns(), "RefundsIssued", 1, { kind: "cancellation" });
      emitMetric(ns(), "OrdersCancelled", 1, { actor: input.actorKind });
      if (split.points > 0) {
        emitMetric(ns(), "PointsReturned", 1);
        await announcePointsForOrder(input.orderId, repo.db);
      }
      return { refundId, amount: formatCents(amountCents), status: REFUND_SUBMITTED, ...splitFields };
    },

    /** A customer's ask against their own order. It moves no money. */
    async raiseRequest(input: { orderId: string; customerId: string; message: string; items: readonly LineInput[] }): Promise<string> {
      const message = input.message.trim().slice(0, MAX_REQUEST_MESSAGE);
      if (message === "") throw new MessageRequiredError();
      if (!UUID.test(input.orderId)) throw new RefundOrderNotFoundError();
      // A named line that is not an id cannot be one of this order's: dropped.
      const requestId = await repo.insertRequest(input.orderId, input.customerId, message, input.items.filter((i) => UUID.test(i.orderItemId)));
      // Back-office and the customer's page change; no shop screen shows a request.
      await announceOrder(input.orderId, { shops: false, db: repo.db });
      return requestId;
    },

    /** Closes a request without money moving. Not emailed. */
    async declineRequest(requestId: string, note: string, decidedBy: string): Promise<void> {
      if (!UUID.test(requestId)) throw new RequestNotFoundError();
      const orderId = await repo.decideRequest(requestId, "declined", note, decidedBy);
      await announceOrder(orderId, { shops: false, db: repo.db });
    },

    /** The provider's side of a refund's life, applied inside the webhook's transaction. */
    async handleRefundEvent(tx: Queryable, evt: WebhookEvent): Promise<{ recognised: boolean; changed: boolean }> {
      if (!evt.refundId) return { recognised: false, changed: false };
      const status = settledStatus(evt.refundStatus);
      if (!status) return { recognised: true, changed: false };

      if (await repo.settleByProviderId(tx, evt.refundId, status, evt.failureReason ?? "")) {
        // Issued fires at submission; this when the outcome lands.
        emitMetric(ns(), "RefundOutcomes", 1, { outcome: status });
        return { recognised: true, changed: true };
      }
      // Not changed: already terminal, or the platform has no row for it.
      if (await repo.knowsProviderRefund(tx, evt.refundId)) return { recognised: true, changed: false };

      // Recorded, never discarded: a refund made in the dashboard is real money.
      await repo.recordUnattributedRefund(tx, evt);
      emitMetric(ns(), "RefundsIssued", 1, { kind: "external" });
      return { recognised: false, changed: true };
    },

    /**
     * Resolves refunds left uncertain: asks the provider whether each exists and records it, or submits
     * it under its stored key. Stock is not returned here (the issuer's choice is not on the row).
     */
    async reconcile(opts: { olderThanSeconds?: number; stuckAfterSeconds?: number; limit?: number } = {}) {
      const stuck = await repo.stuckSubmitting(opts.olderThanSeconds ?? 120, opts.limit ?? 25);
      const outcomes = { found: 0, resubmitted: 0, refused: 0, unresolved: 0 };

      for (const r of stuck) {
        try {
          const existing = (await gateway.listRefunds(r.paymentIntentId)).find((p) => p.metadata.effy_refund_id === r.id);
          let provider = existing;
          if (!provider) {
            // A stalled refund holds no ceiling, so the order may since be refunded: closed as refused.
            if (r.amountCents > (await repo.remainingCents(r.orderId, r.id))) {
              await repo.markRefused(r.id, "not submitted: the order no longer has this much left to refund");
              outcomes.refused++;
              await announceOrder(r.orderId, { db: repo.db });
              continue;
            }
            provider = await gateway.createRefund({
              // The card part, never the total.
              paymentIntentId: r.paymentIntentId, amountCents: r.cardCents, idempotencyKey: r.idempotencyKey,
              reason: "requested_by_customer", metadata: { effy_refund_id: r.id },
            });
          }
          await repo.markSubmitted(r.id, provider.id);
          const settled = settledStatus(provider.status);
          if (settled) await repo.settleByProviderId(repo.db, provider.id, settled, provider.failureReason);
          await quietly(repo.closeOpenRequestForOrder(r.orderId, r.actorSub ?? "system"));
          outcomes[existing ? "found" : "resubmitted"]++;
          await announceOrder(r.orderId, { db: repo.db });
        } catch (err) {
          if (err instanceof RefusedError) {
            await quietly(repo.markRefused(r.id, err.reason));
            outcomes.refused++;
            await announceOrder(r.orderId, { db: repo.db });
          } else {
            outcomes.unresolved++;
          }
        }
      }

      for (const [outcome, n] of Object.entries(outcomes)) if (n > 0) emitMetric(ns(), "RefundsReconciled", n, { outcome });
      const stuckCount = await repo.countSubmittingOlderThan(opts.stuckAfterSeconds ?? 900);
      // Emitted every run, zero included, so its alarm has data.
      emitMetric(ns(), "RefundsStuck", stuckCount, {});
      return { ...outcomes, stuck: stuckCount };
    },
  };
}

export type RefundService = ReturnType<typeof createRefundService>;
