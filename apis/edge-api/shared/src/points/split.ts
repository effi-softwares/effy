/**
 * How a refund splits when the order was paid partly with points. Pure. The split is cumulative: the
 * points side is computed for the running total refunded including this one, and this refund takes the
 * difference, so partial refunds never drift by a cent or a point:
 *
 *  pointsCum(T) = floor( T × pointsValue / G / centsPerPoint ) G = card paid + points value
 *  this refund's points = pointsCum(T) − points returned so far
 *  this refund's card = this refund's amount − points × centsPerPoint
 *
 * At T = G every point and exactly the card amount have been returned.
 */

export interface SplitInput {
  /** This refund's total value, in cents (> 0). */
  amountCents: number;
  /** What the card paid for the order (payment.amount), in cents. */
  cardPaidCents: number;
  /** The points' value on the order (order.points_value_amount), in cents. */
  pointsValueCents: number;
  /** The order's snapshotted value of a point. Ignored when no points were used. */
  centsPerPoint: number;
  /** Total value refunded before this refund (every kind that counts against the ceiling), in cents. */
  refundedBeforeCents: number;
  /** Card money refunded before this refund, in cents. */
  cardRefundedBeforeCents: number;
  /** Points returned before this refund. */
  pointsReturnedBefore: number;
}

export interface Split {
  cardCents: number;
  points: number;
  /** points × centsPerPoint. cardCents + pointsValueCents === amountCents, always. */
  pointsValueCents: number;
}

/**
 * The refund cannot split into whole points plus card money without returning more than the card paid.
 * Only possible above one cent a point with less than one point's value left on the card. Refused,
 * because the two parts must add up exactly.
 */
export class RefundNotSplittableError extends Error {
  constructor() {
    super("points: this amount cannot be split into whole points and card money");
  }
}

export function splitRefund(i: SplitInput): Split {
  if (i.pointsValueCents <= 0) return { cardCents: i.amountCents, points: 0, pointsValueCents: 0 };

  const cpp = i.centsPerPoint;
  const total = i.cardPaidCents + i.pointsValueCents;
  const after = i.refundedBeforeCents + i.amountCents;
  const pointsSpent = Math.round(i.pointsValueCents / cpp);
  const pointsLeft = pointsSpent - i.pointsReturnedBefore;
  const cardLeft = i.cardPaidCents - i.cardRefundedBeforeCents;

  // What the proportion asks for.
  const pointsCum = after >= total ? pointsSpent : Math.floor((after * i.pointsValueCents) / total / cpp);
  const wanted = pointsCum - i.pointsReturnedBefore;

  // What is possible: card part within what the card has left, points within what is left to return.
  const lo = Math.max(0, Math.ceil((i.amountCents - cardLeft) / cpp));
  const hi = Math.min(pointsLeft, Math.floor(i.amountCents / cpp));
  if (lo > hi) throw new RefundNotSplittableError();

  // Keep a card reserve of one point's value less a cent while points remain, so a later sub-point
  // amount can still land on the card. Zero at one cent a point.
  const reserve = Math.min(cpp - 1, i.cardPaidCents);
  const loKeepingReserve = Math.max(lo, Math.ceil((i.amountCents - cardLeft + reserve) / cpp));
  const floor = loKeepingReserve <= hi && hi < pointsLeft ? loKeepingReserve : lo;

  const points = Math.min(hi, Math.max(floor, wanted));
  const pointsValueCents = points * cpp;
  return { cardCents: i.amountCents - pointsValueCents, points, pointsValueCents };
}
