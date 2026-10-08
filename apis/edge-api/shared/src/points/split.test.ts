import { describe, expect, it } from "vitest";

import { RefundNotSplittableError, splitRefund, type SplitInput } from "./split";

/** Run a sequence of refunds against one order and return the running totals. */
function refundInSteps(cardPaid: number, pointsValue: number, centsPerPoint: number, steps: readonly number[]) {
  let refunded = 0;
  let card = 0;
  let points = 0;
  const each: { cardCents: number; points: number }[] = [];
  for (const amount of steps) {
    const s = splitRefund({
      amountCents: amount, cardPaidCents: cardPaid, pointsValueCents: pointsValue, centsPerPoint,
      refundedBeforeCents: refunded, cardRefundedBeforeCents: card, pointsReturnedBefore: points,
    });
    expect(s.cardCents + s.pointsValueCents).toBe(amount);
    expect(s.cardCents).toBeGreaterThanOrEqual(0);
    expect(s.points).toBeGreaterThanOrEqual(0);
    refunded += amount;
    card += s.cardCents;
    points += s.points;
    expect(card).toBeLessThanOrEqual(cardPaid);
    expect(points * centsPerPoint).toBeLessThanOrEqual(pointsValue);
    each.push({ cardCents: s.cardCents, points: s.points });
  }
  return { card, points, each };
}

const base: Omit<SplitInput, "amountCents"> = {
  cardPaidCents: 3000, pointsValueCents: 1000, centsPerPoint: 1,
  refundedBeforeCents: 0, cardRefundedBeforeCents: 0, pointsReturnedBefore: 0,
};

describe("074 — splitRefund (P1)", () => {
  it("splits one refund in the proportion the order was paid", () => {
    // $40.00 paid as $30.00 card + $10.00 points; an $8.00 refund → $6.00 card + 200 points (spec Story 3).
    expect(splitRefund({ ...base, amountCents: 800 })).toEqual({ cardCents: 600, points: 200, pointsValueCents: 200 });
  });

  it("refunds a card-only order entirely to the card", () => {
    expect(splitRefund({ ...base, pointsValueCents: 0, amountCents: 1234 })).toEqual({ cardCents: 1234, points: 0, pointsValueCents: 0 });
  });

  it("refunds a points-only order entirely as points", () => {
    expect(splitRefund({ ...base, cardPaidCents: 0, pointsValueCents: 4200, amountCents: 4200 })).toEqual({
      cardCents: 0, points: 4200, pointsValueCents: 4200,
    });
  });

  it("returns exactly what was paid when a whole order is refunded in one go", () => {
    expect(splitRefund({ ...base, amountCents: 4000 })).toEqual({ cardCents: 3000, points: 1000, pointsValueCents: 1000 });
  });

  it.each([
    ["three awkward pieces", 3000, 1000, 1, [333, 1667, 2000]],
    ["many one-cent pieces", 7, 3, 1, Array.from({ length: 10 }, () => 1)],
    ["odd proportions", 2999, 1001, 1, [1, 1, 1, 997, 1500, 1500]],
    ["a point worth five cents", 3005, 995, 5, [400, 401, 3199]],
    ["a point worth three cents, uneven pieces", 1000, 999, 3, [17, 500, 1482]],
    ["card exactly one point's value less one cent", 99, 300, 100, [1, 1, 397]],
  ] as const)("ends at exactly card paid + points spent: %s", (_, cardPaid, pointsValue, cpp, steps) => {
    const total = steps.reduce((a, b) => a + b, 0);
    expect(total).toBe(cardPaid + pointsValue);
    const out = refundInSteps(cardPaid, pointsValue, cpp, steps);
    expect(out.card).toBe(cardPaid);
    expect(out.points * cpp).toBe(pointsValue);
  });

  it("never over-returns on 500 random sequences, and ends exact whenever every refund could be split", () => {
    let seed = 74;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return 1 + (seed % n);
    };
    for (let k = 0; k < 500; k++) {
      const cpp = [1, 1, 1, 2, 5][k % 5]!;
      const pointsValue = rand(5000) * cpp;
      // Every split is possible once the card has at least one point's value less a cent (or cpp = 1).
      const cardPaid = k % 7 === 0 && cpp === 1 ? 0 : cpp - 1 + rand(9000);
      let left = cardPaid + pointsValue;
      const steps: number[] = [];
      while (left > 0) {
        const s = Math.min(left, rand(Math.max(1, Math.floor(left / 2) + 1)));
        steps.push(s);
        left -= s;
      }
      // At one cent a point every refund splits. Above it a sub-point amount with too little card left
      // CANNOT split exactly (FR-019 forbids rounding), and refusing it is the correct outcome — the
      // ceilings inside refundInSteps have held for every refund before it.
      let out: ReturnType<typeof refundInSteps>;
      try {
        out = refundInSteps(cardPaid, pointsValue, cpp, steps);
      } catch (err) {
        expect(cpp).toBeGreaterThan(1);
        expect(err).toBeInstanceOf(RefundNotSplittableError);
        continue;
      }
      expect(out.card).toBe(cardPaid);
      expect(out.points * cpp).toBe(pointsValue);
    }
  });

  it("refuses an amount that cannot be split exactly rather than over-returning points", () => {
    // A points-only order at 5 cents a point: 3 cents cannot be whole points, and there is no card to take it.
    expect(() => splitRefund({ ...base, cardPaidCents: 0, pointsValueCents: 500, centsPerPoint: 5, amountCents: 3 })).toThrow(
      RefundNotSplittableError,
    );
  });
});
