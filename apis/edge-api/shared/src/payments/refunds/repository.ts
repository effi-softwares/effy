/**
 * Returning money: SQL only. Every rule guards against a shopper refunded twice, refunded more than they
 * paid, or told money is coming when it is not. `public.refund` is append-only apart from `status`,
 * `provider_refund_id`, `failure_reason` and `settled_at` (`refund-append-only.guard.test.ts`).
 */
import { pooled, withTransaction, type Queryable, type Transactor } from "../../lib/db";
import { returnForRefund } from "../../points/ledger";
import { releaseUses } from "../../promotions/uses";
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
 * What a refund is issued against. `paidCents` is the order's total value (card plus points), split in
 * proportion; `cardPaidCents` is the card's part, the only part the provider sees.
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
  /** How this refund is made up; a card part of 0 is already `succeeded`, points back. */
  | { issued: true; refundId: string; paid: PaidContext; split: Split }
  /** The idempotent hit. Carries the existing row's real state. */
  | { issued: false; refundId: string; paid: PaidContext; existingStatus: string };

export interface CancelInput {
  orderId: string;
  /** Set for a customer cancellation: their window closes when picking begins. */
  customerId: string | null;
  actorKind: string;
  actorSub: string;
}

export interface StuckRefund {
  id: string;
  orderId: string;
  amountCents: number;
  /** The card part: the only part sent to the provider. */
  cardCents: number;
  idempotencyKey: string;
  actorSub: string | null;
  paymentIntentId: string;
}

const cents = (v: string | number | null | undefined) => Number(v ?? 0);

/** How long a `submitting` refund counts as in flight: longer than any request (25 s), shorter than the reconciler's first look (120 s). */
export const IN_FLIGHT_SECONDS = 60;

/**
 * Which refunds hold the ceiling down, counted from the rows and never stored: `submitted`,
 * `succeeded`, `failed` (staff must resolve it), and `submitting` while in flight (recorded and
 * committed before the provider call, so two simultaneous refunds cannot each pass the ceiling). A
 * stalled `submitting` does not count; the reconciler re-checks the ceiling before resending it.
 * `refused` never counts.
 */
const COUNTS_AGAINST_CEILING = `(
       r.status IN ('submitted', 'succeeded', 'failed')
    OR (r.status = 'submitting' AND r.created_at > now() - interval '${IN_FLIGHT_SECONDS} seconds')
)`;

const REFUNDED_CENTS = `
SELECT COALESCE(SUM(round(r.amount * 100))::bigint, 0) AS cents,
       -- The two halves. A refund issued outside Effy (card_amount NULL) went entirely to the card.
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

/** The figures a refund is decided against, read under the payment lock. */
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

/** How a refund of `amountCents` is made up, given everything returned before it. */
export function splitFor(paid: PaidContext, amountCents: number): Split {
  return splitRefund({
    amountCents, cardPaidCents: paid.cardPaidCents, pointsValueCents: paid.pointsValueCents, centsPerPoint: paid.centsPerPoint,
    refundedBeforeCents: paid.refundedCents, cardRefundedBeforeCents: paid.cardRefundedCents, pointsReturnedBefore: paid.pointsReturned,
  });
}

/**
 * Writes a refund and its lines in the caller's transaction, having checked the ceiling under the
 * payment lock. The ceiling is `payment.amount`; `FOR UPDATE` serialises two staff refunding at once.
 * Exported so a larger change (a courier override's compensation) commits with its refund; it is
 * submitted after the commit (`submitRecorded`).
 */
export async function recordRefundIn(tx: Queryable, input: InsertInput, beforeLock?: () => Promise<void>): Promise<RecordResult> {
  if (beforeLock) await beforeLock();

  const locked = (await tx.query<PaidRow>(PAID_UNDER_LOCK, [input.orderId])).rows[0];
  if (!locked) throw new RefundOrderNotFoundError();
  const refunded = (await tx.query<{ cents: string; card_cents: string; points: string }>(REFUNDED_CENTS, [input.orderId])).rows[0];
  const paid = paidContext(locked, refunded);

  const remaining = paid.paidCents - paid.refundedCents;
  if (input.amountCents > remaining) throw new CeilingExceededError(remaining);

  // A refund with no card part never reaches the provider: `succeeded`, points back in this transaction.
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
    // The idempotent hit (double-click, retry, redelivery) returns the existing row with its real state.
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
   * Test seam, called just before the row lock: the only placement that makes racing callers genuinely
   * contend. Never set in production.
   */
  beforeLock?: () => Promise<void>,
) {
  return {
    /** The repository's own connection, for a status write made outside any transaction. */
    db,

    /**
     * Prices an item-derived refund from the order line (not the product: prices change) and refuses
     * to refund a unit twice, in one read.
     */
    async priceLines(orderId: string, want: readonly LineInput[]): Promise<{ totalCents: number; lines: InsertLine[] }> {
      let totalCents = 0;
      const lines: InsertLine[] = [];
      for (const w of want) {
        if (!Number.isInteger(w.quantity) || w.quantity <= 0) throw new AmountInvalidError();
        const row = (
          await db.query<{ unit: string; ordered: number; refunded: string; discount: string }>(
            `
SELECT round(oi.unit_price_amount * 100)::bigint AS unit,
       oi.quantity AS ordered,
       round(oi.discount_amount * 100)::bigint AS discount,
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
        // What the shopper paid: the line price less its share of the discount. The last units take any
        // remainder, so a fully refunded line returns exactly its paid amount.
        const paidLine = cents(row.unit) * row.ordered - cents(row.discount ?? "0");
        const before = cents(row.refunded);
        const amountCents = Math.floor((paidLine * (before + w.quantity)) / row.ordered) - Math.floor((paidLine * before) / row.ordered);
        totalCents += amountCents;
        lines.push({ orderItemId: w.orderItemId, quantity: w.quantity, amountCents });
      }
      return { totalCents, lines };
    },

    /** Writes a refund and its lines in a transaction of its own (see `recordRefundIn`). */
    record: (input: InsertInput): Promise<RecordResult> => transact((tx) => recordRefundIn(tx, input, beforeLock)),

    /** A refund recorded in another transaction and not yet sent; null unless `submitting`. */
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

    // Status transitions: the only mutation this table permits.

    /** The provider accepted the request (the bank may still refuse). The points part comes back, once per refund. */
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

    /** Applies a reported outcome, guarded on the current status so a redelivery matches nothing. */
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
      // An outcome can land before `markSubmitted`. Succeeded or failed, the card part was accepted, so the points are due.
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
     * Records a refund made by hand in the provider's dashboard. The order comes from the payment intent
     * (not ours: nothing written); the actor is `system` with no subject. Idempotent on `provider_refund_id`.
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
     * Puts refunded units back only where that is knowable: the portion is uncollected and the product
     * tracked. Inventing stock is worse than not returning it.
     */
    async returnStock(refundId: string, orderId: string): Promise<void> {
      await db.query(
        `
WITH refunded AS (
    -- Back to the VARIANT that was sold. Two lines of one variant cannot exist on one order
    -- (order_item_order_variant_uq), so the UPDATE below meets each variant once.
    SELECT rl.order_item_id, rl.quantity, oi.variant_id, oi.shop_id
      FROM public.refund_line rl
      JOIN public.order_item oi ON oi.id = rl.order_item_id
      JOIN public.shop_fulfillment sf
             ON sf.order_id = oi.order_id AND sf.shop_id = oi.shop_id
     WHERE rl.refund_id = $1
       AND sf.status NOT IN ('collected', 'delivered')
), moved AS (
    UPDATE public.product_variant v
       SET stock_on_hand = v.stock_on_hand + r.quantity
      FROM refunded r
     WHERE v.id = r.variant_id
       AND v.stock_tracked
 RETURNING v.product_id, v.id AS variant_id, r.shop_id, r.quantity,
           v.stock_on_hand - r.quantity AS before, v.stock_on_hand AS after
)
INSERT INTO public.stock_movement
    (product_id, variant_id, shop_id, quantity_delta, quantity_before, quantity_after, reason,
     actor_kind, actor_sub, order_id)
SELECT m.product_id, m.variant_id, m.shop_id, m.quantity, m.before, m.after, 'refund', 'system', NULL, $2
  FROM moved m`,
        [refundId, orderId],
      );
    },

    /** Refuses unless every named line is in this shop's portion: counts rather than filters. */
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

    // Cancellation.

    /**
     * Locks the order, decides cancellability from rows read under the lock, withdraws every portion and
     * releases the delivery place, in one transaction.
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
       -- The two halves already returned, and the points' value on the order.
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
        // A customer's window closes when any shop begins; staff have no such limit.
        if (input.customerId !== null && portions?.started) throw new NotCancellableError();
        // Not after collection, even for staff.
        if (portions?.departed) throw new NotCancellableError();

        await tx.query(`UPDATE public."order" SET status = 'canceled' WHERE id = $1`, [input.orderId]);

        // Withdrawn, not `unfulfillable`: the shop failed nothing. The event carries the previous status;
        // `actor_staff_id` stays null (who did it is on the refund row).
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

        // The window place is given back.
        await tx.query(
          `
UPDATE public.delivery_slot_booking
   SET state = 'released', held_until = NULL, updated_at = now()
 WHERE order_id = $1 AND state <> 'released'`,
          [input.orderId],
        );

        // Its promotion uses, single-use code and budget go back.
        await releaseUses(tx, input.orderId, "cancelled");

        const cardPaidCents = cents(o.paid);
        const pointsValueCents = cents(o.points_value);
        return {
          paidCents: cardPaidCents + pointsValueCents, refundedCents: cents(o.refunded), paymentIntentId: o.intent, currency: o.currency,
          cardPaidCents, cardRefundedCents: cents(o.card_refunded), pointsValueCents, pointsReturned: cents(o.points_back),
          centsPerPoint: o.cpp ?? 1,
        };
      }),

    /**
     * The refund row for a cancellation; null on the idempotent hit. No ceiling lock: `cancelOrder`
     * computed the amount under its own lock. A card-free cancellation is `succeeded`, points back.
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

    // Refund requests: an ask, which moves no money.

    /** The ownership term is in the insert's own SELECT. Only a paid order can be asked about. */
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
          // The partial unique index fired.
          if ((err as { code?: string }).code === "23505") throw new RequestAlreadyOpenError();
          throw err;
        }
        if (!id) throw new RefundOrderNotFoundError();

        for (const item of items) {
          if (!Number.isInteger(item.quantity) || item.quantity <= 0) continue;
          // The line must belong to this order.
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

    /** Guarded on `open`, so a second decision cannot overwrite the first. Returns the order. */
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

    /** A shopper who asked has been answered. No open request is the ordinary case. */
    async closeOpenRequestForOrder(orderId: string, decidedBy: string): Promise<void> {
      await db.query(
        `UPDATE public.refund_request SET status = 'refunded', decided_by = $2, decided_at = now() WHERE order_id = $1 AND status = 'open'`,
        [orderId, decidedBy],
      );
    },

    // Reconciliation.

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

    /** What may still be refunded, leaving out one refund so it can ask what room there is besides itself. */
    async remainingCents(orderId: string, exceptRefundId: string | null = null): Promise<number> {
      const paid = (
        await db.query<{ paid: string }>(
          // Total value: card plus points.
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
