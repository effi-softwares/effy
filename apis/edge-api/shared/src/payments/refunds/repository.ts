/**
 * Returning money: SQL only (055, moved from the retired Go backend by 070).
 *
 * ⚠ EVERY RULE HERE IS ABOUT ONE HARM: a shopper told their money is coming when it is not,
 * refunded twice, or refunded more than they ever paid.
 *
 * ⚠ `public.refund` IS APPEND-ONLY. The only columns any statement here updates are `status`,
 * `provider_refund_id`, `failure_reason` and `settled_at`; `refund-append-only.guard.test.ts` holds
 * every service to that.
 */
import { pooled, withTransaction, type Queryable, type Transactor } from "../../lib/db";
import { returnForRefund } from "../../points/ledger";
import { splitRefund, type Split } from "../../points/split";
import type { WebhookEvent } from "../gateway";
import {
  AlreadyCancelledError, AmountInvalidError, CeilingExceededError, LineOverRefundedError, LinesNotYoursError,
  NoLinesError, NotCancellableError, RefundOrderNotFoundError, RequestAlreadyOpenError, RequestNotFoundError,
} from "./errors";
import { REASON_ORDER_CANCELLED, settledStatus } from "./state";

export interface LineInput {
  orderItemId: string;
  quantity: number;
}

export interface InsertLine extends LineInput {
  amountCents: number;
}

export interface InsertInput {
  orderId: string;
  kind: string;
  amountCents: number;
  currency: string;
  reason: string;
  note: string | null;
  idempotencyKey: string;
  actorKind: string;
  actorSub: string;
  lines: readonly InsertLine[];
}

/**
 * What a refund is issued against.
 *
 * ⚠ 074: `paidCents` is the order's TOTAL VALUE — what the card paid PLUS the points' value — because a
 * refund returns value, and splits it between the two in proportion (research R5). `cardPaidCents` is
 * the card's part alone: the only part the provider ever sees.
 */
export interface PaidContext {
  paidCents: number;
  refundedCents: number;
  paymentIntentId: string;
  currency: string;
  cardPaidCents: number;
  cardRefundedCents: number;
  pointsValueCents: number;
  pointsReturned: number;
  centsPerPoint: number;
}

export type RecordResult =
  /** 074: `split` is how this refund is made up; a card part of 0 is already `succeeded`, points back. */
  | { issued: true; refundId: string; paid: PaidContext; split: Split }
  /** ⚠ The idempotent hit: the same action again. Carries the EXISTING row's real state. */
  | { issued: false; refundId: string; paid: PaidContext; existingStatus: string };

export interface CancelInput {
  orderId: string;
  /** Set for a CUSTOMER cancellation, null for staff: the customer's window closes when picking begins. */
  customerId: string | null;
  actorKind: string;
  actorSub: string;
}

export interface StuckRefund {
  id: string;
  orderId: string;
  amountCents: number;
  /** 074 — the CARD part: the only part ever sent to the provider. */
  cardCents: number;
  idempotencyKey: string;
  actorSub: string | null;
  paymentIntentId: string;
}

const cents = (v: string | number | null | undefined) => Number(v ?? 0);

/**
 * How long a `submitting` refund is treated as IN FLIGHT — its request still running — and so
 * counted against the ceiling. Longer than any request can live (the functions that issue refunds
 * time out at 25 s) and shorter than the reconciler's first look at a stalled one (120 s).
 */
export const IN_FLIGHT_SECONDS = 60;

/**
 * Which refunds hold the ceiling down — the ONE definition, used by every read of "what remains".
 *
 * ⚠ COUNTED FROM THE ROWS, NEVER STORED: a counter and the rows can disagree, and then nobody knows
 * which is true.
 *
 *   · `submitted`, `succeeded` — money that has left or is leaving.
 *   · `failed` — money the platform attempted to return, which staff must resolve. Freeing it would
 *     let a bouncing retry refund an order repeatedly.
 *   · `submitting`, WHILE IN FLIGHT. ⚠ This term is what makes "never more than was paid" true
 *     without the provider's help. A refund is recorded, the transaction commits, and only THEN is
 *     the provider called — so for a moment the row exists and is not yet `submitted`. The backend
 *     this replaces did not count it, and two refunds issued at the same instant could each pass a
 *     ceiling neither had exceeded alone; only the provider refusing the second stood in the way.
 *   · `submitting`, once STALLED (older than the window) — NOT counted. The provider never
 *     answered, the money may never have moved, and an attempt that went nowhere must not make the
 *     platform refuse to return money it still holds. The reconciler resolves it, and checks this
 *     same ceiling before sending it again.
 *
 * `refused` never counts: nothing was sent.
 */
const COUNTS_AGAINST_CEILING = `(
       r.status IN ('submitted', 'succeeded', 'failed')
    OR (r.status = 'submitting' AND r.created_at > now() - interval '${IN_FLIGHT_SECONDS} seconds')
)`;

const REFUNDED_CENTS = `
SELECT COALESCE(SUM(round(r.amount * 100))::bigint, 0) AS cents,
       -- 074 — the two halves. A pre-074 row (card_amount NULL) went entirely to the card.
       COALESCE(SUM(round(COALESCE(r.card_amount, r.amount) * 100))::bigint, 0) AS card_cents,
       COALESCE(SUM(r.points_returned), 0)::bigint AS points
  FROM public.refund r
 WHERE r.order_id = $1 AND ${COUNTS_AGAINST_CEILING}`;

interface PaidRow {
  paid: string;
  intent: string | null;
  currency: string;
  points_value: string;
  cpp: number | null;
}

/** The figures a refund is decided against, read under the payment lock (074 adds the points side). */
const PAID_UNDER_LOCK = `
SELECT round(p.amount * 100)::bigint AS paid, p.stripe_payment_intent_id AS intent, o.currency AS currency,
       round(o.points_value_amount * 100)::bigint AS points_value, o.points_cents_per_point AS cpp
  FROM public.payment p
  JOIN public."order" o ON o.id = p.order_id
 WHERE p.order_id = $1 AND p.status = 'succeeded'
 FOR UPDATE OF p`;

function paidContext(row: PaidRow, refunded: { cents: string; card_cents: string; points: string } | undefined): PaidContext {
  const cardPaidCents = cents(row.paid);
  const pointsValueCents = cents(row.points_value);
  return {
    paidCents: cardPaidCents + pointsValueCents,
    refundedCents: cents(refunded?.cents),
    paymentIntentId: row.intent ?? "",
    currency: row.currency,
    cardPaidCents,
    cardRefundedCents: cents(refunded?.card_cents),
    pointsValueCents,
    pointsReturned: cents(refunded?.points),
    centsPerPoint: row.cpp ?? 1,
  };
}

/** 074 — how a refund of `amountCents` is made up, given everything returned before it. */
export function splitFor(paid: PaidContext, amountCents: number): Split {
  return splitRefund({
    amountCents, cardPaidCents: paid.cardPaidCents, pointsValueCents: paid.pointsValueCents, centsPerPoint: paid.centsPerPoint,
    refundedBeforeCents: paid.refundedCents, cardRefundedBeforeCents: paid.cardRefundedCents, pointsReturnedBefore: paid.pointsReturned,
  });
}

/**
 * Write a refund and its lines, having checked the ceiling under the payment lock — in the CALLER's
 * transaction.
 *
 * ⚠ THE CEILING IS `payment.amount`, NOT the order total: the payment is the record of what was
 * taken. ⚠ `FOR UPDATE` on the payment row is what serialises two staff refunding at once — the
 * second sees the first's row when it sums, INCLUDING while that first one is still on its way
 * to the provider (see COUNTS_AGAINST_CEILING). A read-then-write outside one lock is a way to
 * refund an order twice, and the second refund is real money.
 *
 * 081 — exported so a flow that gives money back AS PART of a larger change (a courier override's
 * compensation) records it in that change's transaction: the move and the refund it owes commit
 * together or not at all. It is then submitted after commit (`submitRecorded`) — 055's
 * record-then-submit, unchanged — and a crash in between leaves a `submitting` row the reconciler
 * resolves.
 */
export async function recordRefundIn(tx: Queryable, input: InsertInput, beforeLock?: () => Promise<void>): Promise<RecordResult> {
  if (beforeLock) await beforeLock();

  const locked = (await tx.query<PaidRow>(PAID_UNDER_LOCK, [input.orderId])).rows[0];
  if (!locked) throw new RefundOrderNotFoundError();
  const refunded = (await tx.query<{ cents: string; card_cents: string; points: string }>(REFUNDED_CENTS, [input.orderId])).rows[0];
  const paid = paidContext(locked, refunded);

  const remaining = paid.paidCents - paid.refundedCents;
  if (input.amountCents > remaining) throw new CeilingExceededError(remaining);

  // 074 — how this refund is made up. ⚠ A refund with NO card part never reaches the provider:
  // it is recorded `succeeded` and its points come back in this same transaction.
  const split = splitFor(paid, input.amountCents);
  const cardFree = split.cardCents === 0;

  const inserted = (
    await tx.query<{ id: string }>(
      `
INSERT INTO public.refund
    (order_id, kind, amount, currency, reason, note, idempotency_key, actor_kind, actor_sub,
     card_amount, points_returned, points_value_amount, status, settled_at)
VALUES ($1, $2, $3::bigint / 100.0, $4, $5, $6, $7, $8, $9,
        $10::bigint / 100.0, $11, $12::bigint / 100.0,
        CASE WHEN $13 THEN 'succeeded' ELSE 'submitting' END, CASE WHEN $13 THEN now() END)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id::text AS id`,
      [
        input.orderId, input.kind, input.amountCents, input.currency, input.reason, input.note,
        input.idempotencyKey, input.actorKind, input.actorSub,
        split.cardCents, split.points, split.pointsValueCents, cardFree,
      ],
    )
  ).rows[0];
  if (!inserted) {
    // ⚠ THE IDEMPOTENT HIT. A double-click, a retry, a redelivered instruction all resolve to
    // the row that already exists — with its REAL state, so an operator whose first attempt
    // never got an answer is not told the same thing as one whose refund was accepted.
    const existing = (
      await tx.query<{ id: string; status: string }>(
        `SELECT id::text AS id, status FROM public.refund WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      )
    ).rows[0];
    if (!existing) throw new Error("refunds: idempotent hit with no existing row");
    return { issued: false, refundId: existing.id, paid, existingStatus: existing.status };
  }

  for (const l of input.lines) {
    await tx.query(
      `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount) VALUES ($1, $2, $3, $4::bigint / 100.0)`,
      [inserted.id, l.orderItemId, l.quantity, l.amountCents],
    );
  }
  if (cardFree) await returnForRefund(tx, inserted.id, new Date());
  return { issued: true, refundId: inserted.id, paid, split };
}

export function createRefundRepository(
  db: Queryable = pooled,
  transact: Transactor = withTransaction,
  /**
   * ⚠ TEST SEAM, called immediately BEFORE the row lock is taken — and the placement is the point.
   * Two callers racing these functions finish fast enough to serialise by accident, so a concurrency
   * proof would pass with the lock removed. Holding them after the lock deadlocks. Releasing both
   * just before it is the only arrangement that makes them genuinely contend. Never set in production.
   */
  beforeLock?: () => Promise<void>,
) {
  return {
    /** The repository's own connection, for a status write made outside any transaction. */
    db,

    /**
     * Price an item-derived refund FROM THE RECEIPT, and refuse to refund a unit twice.
     *
     * ⚠ The price is the ORDER LINE's, not the product's: a price can change after an order.
     * ⚠ The already-refunded count is part of the SAME read as the price.
     */
    async priceLines(orderId: string, want: readonly LineInput[]): Promise<{ totalCents: number; lines: InsertLine[] }> {
      let totalCents = 0;
      const lines: InsertLine[] = [];
      for (const w of want) {
        if (!Number.isInteger(w.quantity) || w.quantity <= 0) throw new AmountInvalidError();
        const row = (
          await db.query<{ unit: string; ordered: number; refunded: string }>(
            `
SELECT round(oi.unit_price_amount * 100)::bigint AS unit,
       oi.quantity AS ordered,
       COALESCE((SELECT SUM(rl.quantity)
                   FROM public.refund_line rl
                   JOIN public.refund rf ON rf.id = rl.refund_id
                  WHERE rl.order_item_id = oi.id
                    AND rf.status IN ('submitting','submitted','succeeded','failed')), 0)::bigint AS refunded
  FROM public.order_item oi
 WHERE oi.id = $1 AND oi.order_id = $2`,
            [w.orderItemId, orderId],
          )
        ).rows[0];
        if (!row) throw new RefundOrderNotFoundError();
        if (cents(row.refunded) + w.quantity > row.ordered) throw new LineOverRefundedError();
        const amountCents = cents(row.unit) * w.quantity;
        totalCents += amountCents;
        lines.push({ orderItemId: w.orderItemId, quantity: w.quantity, amountCents });
      }
      return { totalCents, lines };
    },

    /**
     * Write a refund and its lines in ONE transaction, having checked the ceiling under the same lock.
     *
     * ⚠ THE CEILING IS `payment.amount`, NOT the order total: the payment is the record of what was
     * taken. ⚠ `FOR UPDATE` on the payment row is what serialises two staff refunding at once — the
     * second sees the first's row when it sums, INCLUDING while that first one is still on its way
     * to the provider (see COUNTS_AGAINST_CEILING). A read-then-write outside one lock is a way to
     * refund an order twice, and the second refund is real money.
     */
    /** Write a refund and its lines in ONE transaction of its own (see `recordRefundIn`). */
    record: (input: InsertInput): Promise<RecordResult> => transact((tx) => recordRefundIn(tx, input, beforeLock)),

    /**
     * 081 — a refund recorded in someone else's transaction and not yet sent: what `submitRecorded`
     * needs. Null when it is not `submitting` (a card-free refund already succeeded, or it was sent).
     */
    async recordedForSubmit(refundId: string): Promise<(StuckRefund & { pointsReturned: number }) | null> {
      const r = (
        await db.query<{ id: string; order_id: string; cents: string; card_cents: string; key: string; actor_sub: string | null; intent: string | null; points: number }>(
          `
SELECT r.id::text AS id, r.order_id::text AS order_id, round(r.amount * 100)::bigint AS cents,
       round(COALESCE(r.card_amount, r.amount) * 100)::bigint AS card_cents,
       r.idempotency_key AS key, r.actor_sub, p.stripe_payment_intent_id AS intent, r.points_returned AS points
  FROM public.refund r
  JOIN public.payment p ON p.order_id = r.order_id
 WHERE r.id = $1 AND r.status = 'submitting'`,
          [refundId],
        )
      ).rows[0];
      if (!r || !r.intent) return null;
      return {
        id: r.id, orderId: r.order_id, amountCents: cents(r.cents), cardCents: cents(r.card_cents),
        idempotencyKey: r.key, actorSub: r.actor_sub, paymentIntentId: r.intent, pointsReturned: r.points,
      };
    },

    // ── Status transitions: the only mutation this table permits ──────────────────────────────────

    /** The provider ACCEPTED the request. ⚠ Not "refunded": the bank may refuse weeks later. */
    /**
     * 074 — AND THE POINTS COME BACK, in the same transaction: the provider has accepted the card part,
     * so the points part is returned. ⚠ Idempotent (one `returned` entry per refund), so the reconciler
     * reaching a refund this path already settled returns nothing twice.
     */
    markSubmitted: (refundId: string, providerRefundId: string): Promise<void> =>
      transact(async (tx) => {
        const res = await tx.query(
          `UPDATE public.refund SET status = 'submitted', provider_refund_id = $2 WHERE id = $1 AND status = 'submitting'`,
          [refundId, providerRefundId],
        );
        if ((res.rowCount ?? 0) > 0) await returnForRefund(tx, refundId, new Date());
      }),

    /** A provider decision. Terminal. */
    async markRefused(refundId: string, reason: string, q: Queryable = db): Promise<void> {
      await q.query(
        `UPDATE public.refund SET status = 'refused', failure_reason = $2, settled_at = now() WHERE id = $1 AND status = 'submitting'`,
        [refundId, reason],
      );
    },

    /**
     * Apply an outcome the provider reported. ⚠ GUARDED ON THE CURRENT STATUS: a redelivered event
     * matches zero rows the second time. Returns whether it applied.
     */
    async settleByProviderId(q: Queryable, providerRefundId: string, status: string, failureReason: string): Promise<boolean> {
      const res = await q.query<{ id: string }>(
        `
UPDATE public.refund
   SET status = $2, failure_reason = NULLIF($3, ''), settled_at = now()
 WHERE provider_refund_id = $1 AND status IN ('submitting', 'submitted')
 RETURNING id::text AS id`,
        [providerRefundId, status, failureReason],
      );
      const id = res.rows[0]?.id;
      // 074 — an outcome can land before `markSubmitted` did. Succeeded or later failed, the provider
      // ACCEPTED the card part, so the points part is due (idempotent per refund). Refused: nothing.
      if (id && (status === "succeeded" || status === "failed")) await returnForRefund(q, id, new Date());
      return Boolean(id);
    },

    async knowsProviderRefund(q: Queryable, providerRefundId: string): Promise<boolean> {
      return (
        (await q.query<{ ok: boolean }>(`SELECT EXISTS (SELECT 1 FROM public.refund WHERE provider_refund_id = $1) AS ok`, [providerRefundId]))
          .rows[0]?.ok === true
      );
    },

    /**
     * Record a refund the platform did not issue — made by hand in the provider's dashboard.
     *
     * ⚠ The order is resolved FROM THE PAYMENT INTENT; an intent that is not ours writes nothing.
     * ⚠ Recorded as `system` with no subject: the platform does not know who did it, and inventing
     * an actor would put a false statement in the audit trail.
     * ⚠ Idempotent on `provider_refund_id`.
     */
    async recordUnattributedRefund(q: Queryable, evt: WebhookEvent): Promise<void> {
      await q.query(
        `
INSERT INTO public.refund (order_id, kind, amount, reason, status, idempotency_key,
                           actor_kind, actor_sub, provider_refund_id, failure_reason,
                           note, settled_at)
SELECT p.order_id, 'external', $2::numeric / 100, 'external', $3,
       'provider:' || $1, 'system', NULL, $1,
       CASE WHEN $3 = 'failed'
            THEN COALESCE(NULLIF($4, ''), 'reported failed by the payment provider, with no reason given')
            ELSE NULLIF($4, '') END,
       'Issued outside Effy, in the payment provider. Recorded so the order does not claim money it no longer holds.',
       now()
  FROM public.payment p
 WHERE p.stripe_payment_intent_id = $5
ON CONFLICT (provider_refund_id) DO NOTHING`,
        [evt.refundId, evt.refundAmountCents ?? 0, settledStatus(evt.refundStatus) ?? "", evt.failureReason ?? "", evt.refundPaymentIntentId ?? ""],
      );
    },

    /**
     * Put refunded units back — ONLY where the platform can know it should (055 FR-030): the
     * portion has not been collected, and the product is stock-tracked. (That the refund is
     * item-derived, and that the issuer wanted it, are the caller's half.)
     *
     * ⚠ INVENTING STOCK IS WORSE THAN NOT RETURNING IT. A count too low costs a sale; a count too
     * high costs a customer their order at the shelf, hours later.
     */
    async returnStock(refundId: string, orderId: string): Promise<void> {
      await db.query(
        `
WITH refunded AS (
    SELECT rl.order_item_id, rl.quantity, oi.product_id, oi.shop_id
      FROM public.refund_line rl
      JOIN public.order_item oi ON oi.id = rl.order_item_id
      JOIN public.shop_fulfillment sf
             ON sf.order_id = oi.order_id AND sf.shop_id = oi.shop_id
     WHERE rl.refund_id = $1
       AND sf.status NOT IN ('collected', 'delivered')
), moved AS (
    UPDATE public.product p
       SET stock_on_hand = p.stock_on_hand + r.quantity
      FROM refunded r
     WHERE p.id = r.product_id
       AND p.stock_tracked
 RETURNING p.id AS product_id, r.shop_id, r.quantity,
           p.stock_on_hand - r.quantity AS before, p.stock_on_hand AS after
)
INSERT INTO public.stock_movement
    (product_id, shop_id, quantity_delta, quantity_before, quantity_after, reason,
     actor_kind, actor_sub, order_id)
SELECT m.product_id, m.shop_id, m.quantity, m.before, m.after, 'refund', 'system', NULL, $2
  FROM moved m`,
        [refundId, orderId],
      );
    },

    /**
     * Refuse unless EVERY named line is part of this shop's portion.
     * ⚠ IT COUNTS RATHER THAN FILTERS: returning the matching subset would make a partly-wrong
     * request succeed quietly, refunding less than was asked while saying it worked.
     */
    async assertLinesBelongToShop(orderId: string, shopId: string, lines: readonly LineInput[]): Promise<void> {
      if (lines.length === 0) throw new NoLinesError();
      const ids = [...new Set(lines.map((l) => l.orderItemId))];
      const matched = (
        await db.query<{ n: string }>(
          `
SELECT COUNT(DISTINCT oi.id) AS n
  FROM public.order_item oi
  JOIN public.shop_fulfillment f
    ON f.order_id = oi.order_id AND f.shop_id = oi.shop_id
 WHERE oi.order_id = $1
   AND oi.shop_id  = $2
   AND oi.id       = ANY($3::uuid[])`,
          [orderId, shopId, ids],
        )
      ).rows[0];
      if (Number(matched?.n ?? 0) !== ids.length || ids.length !== lines.length) throw new LinesNotYoursError();
    },

    // ── Cancellation ──────────────────────────────────────────────────────────────────────────────

    /**
     * The guarded transition: lock the order, decide cancellability from rows read UNDER that lock,
     * withdraw every shop portion and release the delivery place — one transaction.
     *
     * ⚠ Any arrangement that checks and then writes lets a shop start picking between the two, and
     * then a customer has been refunded for an order somebody is packing.
     */
    cancelOrder: (input: CancelInput): Promise<PaidContext> =>
      transact(async (tx) => {
        if (beforeLock) await beforeLock();

        const o = (
          await tx.query<{ status: string; intent: string; paid: string; refunded: string; card_refunded: string; points_back: string; points_value: string; cpp: number | null; currency: string }>(
            `
SELECT o.status,
       COALESCE(p.stripe_payment_intent_id, '') AS intent,
       COALESCE(round(p.amount * 100)::bigint, 0) AS paid,
       COALESCE((SELECT SUM(round(r.amount * 100))::bigint
                   FROM public.refund r
                  WHERE r.order_id = o.id
                    AND ${COUNTS_AGAINST_CEILING}), 0) AS refunded,
       -- 074 — the two halves already returned, and the points' value on the order.
       COALESCE((SELECT SUM(round(COALESCE(r.card_amount, r.amount) * 100))::bigint
                   FROM public.refund r
                  WHERE r.order_id = o.id
                    AND ${COUNTS_AGAINST_CEILING}), 0) AS card_refunded,
       COALESCE((SELECT SUM(r.points_returned)::bigint
                   FROM public.refund r
                  WHERE r.order_id = o.id
                    AND ${COUNTS_AGAINST_CEILING}), 0) AS points_back,
       round(o.points_value_amount * 100)::bigint AS points_value, o.points_cents_per_point AS cpp, o.currency
  FROM public."order" o
  LEFT JOIN public.payment p ON p.order_id = o.id AND p.status = 'succeeded'
 WHERE o.id = $1
   -- ⚠ THE OWNERSHIP TERM IS IN THE SAME PREDICATE AS THE LOOKUP. A null second parameter is the
   -- staff case. Asking "does it exist?" then "is it yours?" makes the refusal an oracle for
   -- which order ids are real.
   AND ($2::uuid IS NULL OR o.customer_id = $2::uuid)
   FOR UPDATE OF o`,
            [input.orderId, input.customerId],
          )
        ).rows[0];
        if (!o) throw new RefundOrderNotFoundError();
        if (o.status === "canceled") throw new AlreadyCancelledError();
        // An unpaid order has no money to return and nothing to call off.
        if (o.status !== "paid") throw new NotCancellableError();

        const portions = (
          await tx.query<{ started: boolean; departed: boolean }>(
            `
SELECT COALESCE(bool_or(sf.status <> 'pending'), false) AS started,
       COALESCE(bool_or(sf.status IN ('collected', 'delivered')), false) AS departed
  FROM public.shop_fulfillment sf WHERE sf.order_id = $1`,
            [input.orderId],
          )
        ).rows[0];
        // ⚠ A CUSTOMER's window closes when ANY shop begins preparing. Staff have no such limit: a
        // phone call arrives after the customer's own control has gone.
        if (input.customerId !== null && portions?.started) throw new NotCancellableError();
        // ⚠ NOT AFTER COLLECTION, EVEN FOR STAFF: somebody is carrying it.
        if (portions?.departed) throw new NotCancellableError();

        await tx.query(`UPDATE public."order" SET status = 'canceled' WHERE id = $1`, [input.orderId]);

        // ⚠ WITHDRAWN, NOT `unfulfillable`: the shop did not fail to supply anything. The event is
        // written in the SAME statement, carrying the previous status. `actor_staff_id` stays NULL —
        // no shop staff member did this; the WHO lives on the refund row.
        await tx.query(
          `
WITH withdrawn AS (
    UPDATE public.shop_fulfillment
       SET status = 'withdrawn', state_changed_at = now()
     WHERE order_id = $1 AND status NOT IN ('collected', 'delivered', 'withdrawn')
 RETURNING id, status AS to_status,
           (SELECT prev.status FROM public.shop_fulfillment prev WHERE prev.id = shop_fulfillment.id) AS from_status
)
INSERT INTO public.fulfillment_event (shop_fulfillment_id, event_type, from_status, to_status)
SELECT w.id, 'state_changed', w.from_status, 'withdrawn' FROM withdrawn w`,
          [input.orderId],
        );

        // 069 — the same-day place is given back; `released` stops counting.
        await tx.query(
          `
UPDATE public.delivery_slot_booking
   SET state = 'released', held_until = NULL, updated_at = now()
 WHERE order_id = $1 AND state <> 'released'`,
          [input.orderId],
        );

        const cardPaidCents = cents(o.paid);
        const pointsValueCents = cents(o.points_value);
        return {
          paidCents: cardPaidCents + pointsValueCents, refundedCents: cents(o.refunded), paymentIntentId: o.intent, currency: o.currency,
          cardPaidCents, cardRefundedCents: cents(o.card_refunded), pointsValueCents, pointsReturned: cents(o.points_back),
          centsPerPoint: o.cpp ?? 1,
        };
      }),

    /**
     * The refund row for a cancellation; null on the idempotent hit.
     *
     * ⚠ No ceiling lock here, and that is not an omission: `cancelOrder` has just moved the order to
     * `canceled` under its own lock, and the amount was computed from rows read under it.
     * ⚠ `cancellation` is its OWN kind, not goodwill — the kind is what staff read.
     */
    /**
     * 074 — with its card/points split. A card-free cancellation (a points-only order) is recorded
     * `succeeded` with its points back in the same transaction; it never reaches the provider.
     */
    recordCancellationRefund: (input: CancelInput, amountCents: number, key: string, split: Split): Promise<string | null> =>
      transact(async (tx) => {
        const cardFree = split.cardCents === 0;
        const id =
          (
            await tx.query<{ id: string }>(
              `
INSERT INTO public.refund
    (order_id, kind, amount, currency, reason, note, idempotency_key, actor_kind, actor_sub,
     card_amount, points_returned, points_value_amount, status, settled_at)
VALUES ($1, 'cancellation', $2::bigint / 100.0, 'AUD', $3, $4, $5, $6, $7,
        $8::bigint / 100.0, $9, $10::bigint / 100.0,
        CASE WHEN $11 THEN 'succeeded' ELSE 'submitting' END, CASE WHEN $11 THEN now() END)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id::text AS id`,
              [
                input.orderId, amountCents, REASON_ORDER_CANCELLED, "The order was cancelled before anyone began preparing it.",
                key, input.actorKind, input.actorSub, split.cardCents, split.points, split.pointsValueCents, cardFree,
              ],
            )
          ).rows[0]?.id ?? null;
        if (id && cardFree) await returnForRefund(tx, id, new Date());
        return id;
      }),

    // ── Refund requests: an ASK, which moves no money ─────────────────────────────────────────────

    /**
     * ⚠ THE OWNERSHIP TERM IS IN THE INSERT'S OWN SELECT: an order that is not the caller's produces
     * zero rows, indistinguishable from one that does not exist. Only a PAID order can be asked about.
     */
    insertRequest: (orderId: string, customerId: string, message: string, items: readonly LineInput[]): Promise<string> =>
      transact(async (tx) => {
        let id: string | undefined;
        try {
          id = (
            await tx.query<{ id: string }>(
              `
INSERT INTO public.refund_request (order_id, customer_id, message)
SELECT o.id, o.customer_id, $3
  FROM public."order" o
 WHERE o.id = $1 AND o.customer_id = $2 AND o.status = 'paid'
RETURNING id::text AS id`,
              [orderId, customerId, message],
            )
          ).rows[0]?.id;
        } catch (err) {
          // ⚠ The partial unique index fired: the check-then-write race, refused by the database.
          if ((err as { code?: string }).code === "23505") throw new RequestAlreadyOpenError();
          throw err;
        }
        if (!id) throw new RefundOrderNotFoundError();

        for (const item of items) {
          if (!Number.isInteger(item.quantity) || item.quantity <= 0) continue;
          // ⚠ The line must belong to THIS order.
          await tx.query(
            `
INSERT INTO public.refund_request_item (request_id, order_item_id, quantity)
SELECT $1, oi.id, $3
  FROM public.order_item oi
 WHERE oi.id = $2 AND oi.order_id = $4
ON CONFLICT (request_id, order_item_id) DO NOTHING`,
            [id, item.orderItemId, item.quantity, orderId],
          );
        }
        return id;
      }),

    /** ⚠ Guarded on `open`: a second decision cannot overwrite the first. */
    /** Returns the order the request was against (071: whose screens to tell). */
    async decideRequest(requestId: string, status: "declined" | "refunded", note: string, decidedBy: string): Promise<string> {
      const res = await db.query<{ order_id: string }>(
        `
UPDATE public.refund_request
   SET status = $2, outcome_note = NULLIF($3, ''), decided_by = $4, decided_at = now()
 WHERE id = $1 AND status = 'open'
RETURNING order_id::text AS order_id`,
        [requestId, status, note, decidedBy],
      );
      const orderId = res.rows[0]?.order_id;
      if (!orderId) throw new RequestNotFoundError();
      return orderId;
    },

    /** A shopper who asked has now been answered. No open request is the ordinary case, not an error. */
    async closeOpenRequestForOrder(orderId: string, decidedBy: string): Promise<void> {
      await db.query(
        `UPDATE public.refund_request SET status = 'refunded', decided_by = $2, decided_at = now() WHERE order_id = $1 AND status = 'open'`,
        [orderId, decidedBy],
      );
    },

    // ── Reconciliation (070 FR-024) ───────────────────────────────────────────────────────────────

    /** Refunds that asked the provider and never recorded an answer, oldest first. */
    async stuckSubmitting(olderThanSeconds: number, limit: number): Promise<StuckRefund[]> {
      return (
        await db.query<{ id: string; order_id: string; cents: string; card_cents: string; key: string; actor_sub: string | null; intent: string }>(
          `
SELECT r.id::text AS id, r.order_id::text AS order_id, round(r.amount * 100)::bigint AS cents,
       round(COALESCE(r.card_amount, r.amount) * 100)::bigint AS card_cents,
       r.idempotency_key AS key, r.actor_sub, p.stripe_payment_intent_id AS intent
  FROM public.refund r
  JOIN public.payment p ON p.order_id = r.order_id
 WHERE r.status = 'submitting'
   AND r.created_at < now() - make_interval(secs => $1)
   AND p.stripe_payment_intent_id IS NOT NULL
 ORDER BY r.created_at ASC
 LIMIT $2`,
          [olderThanSeconds, limit],
        )
      ).rows.map((r) => ({
        id: r.id, orderId: r.order_id, amountCents: cents(r.cents), cardCents: cents(r.card_cents),
        idempotencyKey: r.key, actorSub: r.actor_sub, paymentIntentId: r.intent,
      }));
    },

    /**
     * What may still be refunded on an order right now: paid, less everything the ceiling counts —
     * leaving out one refund, so a refund can ask what there is room for besides itself.
     */
    async remainingCents(orderId: string, exceptRefundId: string | null = null): Promise<number> {
      const paid = (
        await db.query<{ paid: string }>(
          // 074 — the order's total VALUE: what the card paid plus the points' value.
          `SELECT COALESCE(round((p.amount + o.points_value_amount) * 100)::bigint, 0) AS paid
             FROM public.payment p JOIN public."order" o ON o.id = p.order_id
            WHERE p.order_id = $1 AND p.status = 'succeeded'`,
          [orderId],
        )
      ).rows[0];
      const refunded = (
        await db.query<{ cents: string }>(`${REFUNDED_CENTS} AND ($2::uuid IS NULL OR r.id <> $2::uuid)`, [orderId, exceptRefundId])
      ).rows[0];
      return cents(paid?.paid) - cents(refunded?.cents);
    },

    async countSubmittingOlderThan(seconds: number): Promise<number> {
      return Number(
        (
          await db.query<{ n: string }>(
            `SELECT count(*) AS n FROM public.refund WHERE status = 'submitting' AND created_at < now() - make_interval(secs => $1)`,
            [seconds],
          )
        ).rows[0]?.n ?? 0,
      );
    },
  };
}

export type RefundRepository = ReturnType<typeof createRefundRepository>;
