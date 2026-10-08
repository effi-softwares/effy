import type { CheckoutPointsDTO } from "@effy/shared-types"

/**
 * 074 — the most points this order can take, and how the total splits. PURE, so it is tested alone.
 *
 * ⚠ THE SERVER RE-DECIDES ALL OF IT at the intent call and refuses what it cannot honour. This only
 * keeps the control from offering a number the server would refuse: never more than the customer has,
 * never more than the total, and never a card remainder the provider cannot charge.
 */
export function maxPointsFor(points: CheckoutPointsDTO | undefined, totalCents: number): number {
  if (!points || totalCents <= 0) return 0
  const cpp = points.centsPerPoint
  const minimumCents = Math.round(Number(points.cardMinimumAmount) * 100)
  let max = Math.min(points.usable, Math.floor(totalCents / cpp))
  const remainder = totalCents - max * cpp
  if (remainder > 0 && remainder < minimumCents) max = Math.max(0, Math.floor((totalCents - minimumCents) / cpp))
  return max
}

export interface PointsSplit {
  pointsUsed: number
  pointsCents: number
  cardCents: number
}

/** Clamp a requested number of points to what is allowed, and split the total. */
export function splitTotal(points: CheckoutPointsDTO | undefined, totalCents: number, requested: number): PointsSplit {
  const max = maxPointsFor(points, totalCents)
  let used = Math.max(0, Math.min(Math.floor(requested), max))
  // A remainder under the minimum can also come from a SMALLER request; step down to a chargeable one.
  if (points && used > 0) {
    const minimumCents = Math.round(Number(points.cardMinimumAmount) * 100)
    const remainder = totalCents - used * points.centsPerPoint
    if (remainder > 0 && remainder < minimumCents) used = Math.max(0, Math.floor((totalCents - minimumCents) / points.centsPerPoint))
  }
  const pointsCents = used * (points?.centsPerPoint ?? 1)
  return { pointsUsed: used, pointsCents, cardCents: totalCents - pointsCents }
}
