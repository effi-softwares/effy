/**
 * How a refund is made up when the order was paid partly with points (074, research R5). PURE.
 *
 * ⚠ THE SPLIT IS CUMULATIVE, NEVER PER REFUND. Splitting each refund on its own rounds every time, and
 * three partial refunds of one order can then return a cent more card money than was paid, or a point
 * fewer than was spent. Instead the points side is computed for the RUNNING TOTAL refunded so far,
 * including this refund, and this refund takes the difference:
 *
 *     pointsCum(T) = floor( T × pointsValue / G / centsPerPoint )     G = card paid + points value
 *     this refund's points = pointsCum(T) − points returned so far
 *     this refund's card   = this refund's amount − points × centsPerPoint
 *
 * When the last cent is refunded T = G, so pointsCum = every point spent and the card side is exactly
 * what the card paid (FR-019, SC-005). On the way there rounding favours the card by less than one
 * point's value — and the result is always held inside what is still possible for both sides.
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
  /** Total value refunded BEFORE this refund (all kinds that count against the ceiling), in cents. */
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
 * The refund cannot be split into whole points plus card money without returning more card money than
 * the card paid. Only possible when a point is worth more than one cent AND the card side has less
 * than one point's value left — never at the default of one cent per point. Refused rather than
 * rounded: FR-019 says the two parts add up EXACTLY, and rounding up would return more points than
 * were spent.
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

  // What the proportion asks for (cumulative — see the file header).
  const pointsCum = after >= total ? pointsSpent : Math.floor((after * i.pointsValueCents) / total / cpp);
  const wanted = pointsCum - i.pointsReturnedBefore;

  // What is POSSIBLE for this refund: the card part must be between 0 and what the card has left, and
  // no more points may come back than are left to return.
  const lo = Math.max(0, Math.ceil((i.amountCents - cardLeft) / cpp));
  const hi = Math.min(pointsLeft, Math.floor(i.amountCents / cpp));
  if (lo > hi) throw new RefundNotSplittableError();

  // Where it can, keep a card RESERVE of one point's value less a cent while points remain to be
  // returned: a later sub-point amount can then still land on the card. At one cent a point the
  // reserve is zero and this changes nothing.
  const reserve = Math.min(cpp - 1, i.cardPaidCents);
  const loKeepingReserve = Math.max(lo, Math.ceil((i.amountCents - cardLeft + reserve) / cpp));
  const floor = loKeepingReserve <= hi && hi < pointsLeft ? loKeepingReserve : lo;

  const points = Math.min(hi, Math.max(floor, wanted));
  const pointsValueCents = points * cpp;
  return { cardCents: i.amountCents - pointsValueCents, points, pointsValueCents };
}
