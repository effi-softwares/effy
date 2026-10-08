import { describe, expect, it } from "vitest"

import { maxPointsFor, splitTotal } from "./points"

const P = { usable: 5000, centsPerPoint: 1, cardMinimumAmount: "0.50" }

describe("074 — the points a checkout can take", () => {
  it("is the lower of the balance and the total", () => {
    expect(maxPointsFor(P, 4780)).toBe(4780)
    expect(maxPointsFor({ ...P, usable: 1250 }, 4780)).toBe(1250)
  })

  it("never leaves a card remainder the provider cannot charge", () => {
    // 5,000 points on a $50.20 order would leave 20¢: step down to leave 50¢.
    expect(maxPointsFor(P, 5020)).toBe(4970)
    expect(splitTotal(P, 5020, 5000)).toEqual({ pointsUsed: 4970, pointsCents: 4970, cardCents: 50 })
    // A smaller request that would leave 30¢ steps down too.
    expect(splitTotal({ ...P, usable: 10_000 }, 5000, 4970)).toEqual({ pointsUsed: 4950, pointsCents: 4950, cardCents: 50 })
  })

  it("splits exactly, and uses nothing when switched off or absent", () => {
    expect(splitTotal({ ...P, usable: 1250 }, 4780, Number.MAX_SAFE_INTEGER)).toEqual({ pointsUsed: 1250, pointsCents: 1250, cardCents: 3530 })
    expect(splitTotal(P, 4200, 4200)).toEqual({ pointsUsed: 4200, pointsCents: 4200, cardCents: 0 })
    expect(splitTotal(P, 4780, 0)).toEqual({ pointsUsed: 0, pointsCents: 0, cardCents: 4780 })
    expect(splitTotal(undefined, 4780, 999)).toEqual({ pointsUsed: 0, pointsCents: 0, cardCents: 4780 })
  })
})
