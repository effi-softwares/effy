import { describe, expect, it } from "vitest";

import { customerCompensationOf, overrideAmounts, pointsFor } from "./override";

/** 081 P1 — what each way of making it right gives, before any database is involved. */
describe("overrideAmounts (081 P1)", () => {
  const base = { centsPerPoint: 1, refundableCents: 100_00 };

  it("the default is the difference between what was paid and the courier fee, as points", () => {
    const a = overrideAmounts({ ...base, paidCents: 900, courierCents: 650 });
    expect(a.differenceCents).toBe(250);
    expect(a.choices.points_difference).toEqual({ cents: 250, points: 250 });
    expect(a.choices.refund_difference).toEqual({ cents: 250, points: null });
  });

  it("free delivery is the whole charge back, as points or to the card", () => {
    const a = overrideAmounts({ ...base, paidCents: 900, courierCents: 650 });
    expect(a.choices.free_delivery_points).toEqual({ cents: 900, points: 900 });
    expect(a.choices.free_delivery_refund).toEqual({ cents: 900, points: null });
  });

  it("⚠ a dearer courier is never the customer's: the difference is zero, never negative", () => {
    const a = overrideAmounts({ ...base, paidCents: 600, courierCents: 1200 });
    expect(a.differenceCents).toBe(0);
    expect(a.choices.points_difference).toEqual({ cents: 0, points: 0 });
    expect(a.choices.refund_difference.cents).toBe(0);
  });

  it("points round UP, in the customer's favour", () => {
    expect(pointsFor(251, 2)).toBe(126);
    expect(pointsFor(0, 2)).toBe(0);
    const a = overrideAmounts({ ...base, centsPerPoint: 2, paidCents: 901, courierCents: 650 });
    expect(a.choices.points_difference.points).toBe(126);
  });

  it("a card refund is capped at what may still be refunded", () => {
    const a = overrideAmounts({ paidCents: 900, courierCents: 0, centsPerPoint: 1, refundableCents: 400 });
    expect(a.choices.free_delivery_refund.cents).toBe(400);
    expect(a.choices.refund_difference.cents).toBe(400);
    // Points are not money back on the order and are not capped by it.
    expect(a.choices.free_delivery_points.cents).toBe(900);
  });

  it("a move back to Effy has no difference and gives nothing", () => {
    const a = overrideAmounts({ ...base, paidCents: 900, courierCents: null });
    expect(a.differenceCents).toBeNull();
    expect(a.choices.none).toEqual({ cents: 0, points: null });
  });
});

describe("customerCompensationOf — what the customer is told they received", () => {
  it("points, a refund, or nothing", () => {
    expect(customerCompensationOf({ compensation: "points_difference", amount_cents: 250, points: 250 })).toEqual({ kind: "points", amount: "2.50", points: 250 });
    expect(customerCompensationOf({ compensation: "free_delivery_refund", amount_cents: 900, points: null })).toEqual({ kind: "refund", amount: "9.00" });
    expect(customerCompensationOf({ compensation: "none", amount_cents: 0, points: null })).toBeNull();
    // A points kind that came to zero gave nothing, and says nothing.
    expect(customerCompensationOf({ compensation: "points_difference", amount_cents: 0, points: 0 })).toBeNull();
  });
});
