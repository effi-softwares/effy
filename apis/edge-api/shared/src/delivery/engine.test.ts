import { describe, expect, it } from "vitest";

import {
  basketValueCents, courierFee, distanceBandFor, effyFee, feeLines, UnpricedDistanceError, UnpricedWeightError,
  weightBandFor, type CourierPlanValues, type EffyPlanValues, type FeeBreakdown,
} from "./engine";

// The plan every table below is worked against, by hand:
//   base $3.00 · ≤10 km +$0 · ≤20 km +$2.00 · beyond +$5.00
//   ≤5 kg +$0 · ≤15 kg +$1.50 · heavier +$4.00 · step $0.50 · minimum $4.00 · maximum $15.00
const plan = (over: Partial<EffyPlanValues> = {}): EffyPlanValues => ({
  baseCents: 300,
  distanceBands: [
    { upperKm: 10, addCents: 0 },
    { upperKm: 20, addCents: 200 },
    { upperKm: null, addCents: 500 },
  ],
  weightBands: [
    { upperGrams: 5000, addCents: 0 },
    { upperGrams: 15000, addCents: 150 },
    { upperGrams: 30000, addCents: 400 },
  ],
  freeOverCents: null,
  smallOrderUnderCents: null,
  smallOrderFeeCents: 0,
  stepCents: 50,
  floorCents: 400,
  capCents: 1500,
  ...over,
});

const price = (km: number, grams: number, over: Partial<EffyPlanValues> = {}, basketCents = 5000, premiumCents = 0) =>
  effyFee({ km, grams, basketCents, premiumCents, plan: plan(over) });

const sum = (b: FeeBreakdown) => feeLines(b).reduce((s, l) => s + l.cents, 0);

describe("effyFee — P1, to the cent", () => {
  it.each([
    // km, grams, expected delivery cents — and why
    [0, 1, 400], //       300 → under the minimum → 400
    [10, 1, 400], //      exactly on the boundary: the LOWER band
    [10.01, 1, 500], //   300 + 200
    [20, 1, 500], //      boundary again: the lower band
    [20.01, 1, 800], //   300 + 500
    [900, 1, 800], //     the open-ended band prices any distance
    [5, 5000, 400], //    weight boundary: the lower band
    [5, 5001, 450], //    300 + 150
    [5, 15000, 450],
    [5, 15001, 700], //   300 + 400
    [5, 80000, 700], //   heavier than every band: the heaviest
    [25, 80000, 1200], // 300 + 500 + 400
  ])("%s km, %s g → %s", (km, grams, want) => {
    const b = price(km, grams);
    expect(b.deliveryCents).toBe(want);
    expect(b.totalCents).toBe(want);
  });

  it("rounds UP to the step, never down", () => {
    // 300 + 200 + 150 + 30 premium = 680 → 700, not 650.
    const b = price(15, 6000, {}, 5000, 30);
    expect(b.rawCents).toBe(680);
    expect(b.roundedCents).toBe(700);
    expect(b.deliveryCents).toBe(700);
    expect(b.clamp).toBeNull();
  });

  it("an amount already on the step is not pushed to the next one", () => {
    expect(price(15, 6000).roundedCents).toBe(650);
  });

  it("holds the fee at the minimum and says so", () => {
    const b = price(1, 1);
    expect(b.roundedCents).toBe(300);
    expect(b.clamp).toBe("floor");
    expect(b.deliveryCents).toBe(400);
  });

  it("holds the fee at the maximum and says so", () => {
    const b = price(25, 80000, { capCents: 1000 });
    expect(b.roundedCents).toBe(1200);
    expect(b.clamp).toBe("cap");
    expect(b.deliveryCents).toBe(1000);
  });

  it("is always a multiple of the step and within the limits", () => {
    for (const km of [0, 9.99, 10, 14.3, 20, 77])
      for (const g of [1, 4999, 5000, 9000, 15001, 99999])
        for (const premium of [0, 30, 200, 5000]) {
          const got = price(km, g, {}, 5000, premium).deliveryCents;
          expect(got % 50).toBe(0);
          expect(got).toBeGreaterThanOrEqual(400);
          expect(got).toBeLessThanOrEqual(1500);
        }
  });

  it("records the band each part came from", () => {
    const b = price(15, 6000);
    expect(b.distanceBandUpperKm).toBe(20);
    expect(b.weightBandUpperGrams).toBe(15000);
    expect(price(500, 80000).distanceBandUpperKm).toBeNull();
    expect(price(500, 80000).weightBandUpperGrams).toBeNull();
  });

  it("bands are matched whatever order they arrive in", () => {
    const shuffled = plan();
    const reversed = { ...shuffled, distanceBands: [...shuffled.distanceBands].reverse(), weightBands: [...shuffled.weightBands].reverse() };
    for (const km of [3, 10, 15, 300])
      for (const g of [100, 9000, 70000])
        expect(effyFee({ km, grams: g, basketCents: 0, premiumCents: 0, plan: reversed }).totalCents).toBe(price(km, g).totalCents);
  });
});

describe("a plan that cannot price fails LOUD, never free", () => {
  it("no open-ended distance band", () => {
    const closed = plan({ distanceBands: [{ upperKm: 10, addCents: 0 }] });
    expect(() => effyFee({ km: 11, grams: 1, basketCents: 0, premiumCents: 0, plan: closed })).toThrow(UnpricedDistanceError);
    expect(() => distanceBandFor(3, [])).toThrow(UnpricedDistanceError);
  });

  it("no weight bands", () => {
    expect(() => weightBandFor(500, [])).toThrow(UnpricedWeightError);
    expect(() => effyFee({ km: 1, grams: 500, basketCents: 0, premiumCents: 0, plan: plan({ weightBands: [] }) })).toThrow(UnpricedWeightError);
  });
});

describe("P2 — heavier is never cheaper, farther is never cheaper", () => {
  // Monotonic plans only: activation refuses the others (`delivery_plan_gaps`).
  const plans: EffyPlanValues[] = [];
  for (const base of [0, 250, 999])
    for (const step of [10, 50, 100])
      for (const far of [0, 137, 900])
        plans.push(plan({
          baseCents: base, stepCents: step, floorCents: step * 2, capCents: step * 40,
          distanceBands: [{ upperKm: 8, addCents: 0 }, { upperKm: 30, addCents: far }, { upperKm: null, addCents: far * 2 }],
          weightBands: [{ upperGrams: 2000, addCents: 0 }, { upperGrams: 9000, addCents: 133 }, { upperGrams: 20000, addCents: 666 }],
        }));

  const kms = [0, 7.99, 8, 8.01, 29, 30, 30.5, 400];
  const weights = [1, 2000, 2001, 9000, 9001, 20000, 50000];

  it("over a grid of plans", () => {
    for (const p of plans) {
      for (const km of kms) {
        let last = -1;
        for (const g of weights) {
          const got = effyFee({ km, grams: g, basketCents: 0, premiumCents: 0, plan: p }).totalCents;
          expect(got).toBeGreaterThanOrEqual(last);
          last = got;
        }
      }
      for (const g of weights) {
        let last = -1;
        for (const km of kms) {
          const got = effyFee({ km, grams: g, basketCents: 0, premiumCents: 0, plan: p }).totalCents;
          expect(got).toBeGreaterThanOrEqual(last);
          last = got;
        }
      }
    }
  });
});

describe("P4 — free delivery", () => {
  const free = { freeOverCents: 8000 };

  it("a basket exactly at the amount is free — window surcharge included", () => {
    const b = price(15, 6000, free, 8000, 300);
    expect(b.freeApplied).toBe(true);
    expect(b.deliveryCents).toBe(0);
    expect(b.totalCents).toBe(0);
    // The customer is still told what it would have cost.
    expect(b.clampedCents).toBe(950);
  });

  it("one cent under is not", () => {
    const b = price(15, 6000, free, 7999, 300);
    expect(b.freeApplied).toBe(false);
    expect(b.deliveryCents).toBe(950);
  });

  it("with no amount set, no basket is ever free", () => {
    expect(price(1, 1, {}, 10_000_000).deliveryCents).toBe(400);
  });
});

describe("P5 — the small-order fee", () => {
  const small = { smallOrderUnderCents: 2000, smallOrderFeeCents: 300 };

  it("is added under the amount, on top of the delivery fee", () => {
    const b = price(1, 1, small, 1999);
    expect(b.smallOrderCents).toBe(300);
    expect(b.totalCents).toBe(700);
  });

  it("a basket exactly at the amount does not pay it", () => {
    expect(price(1, 1, small, 2000).smallOrderCents).toBe(0);
  });

  it("sits OUTSIDE the maximum — a capped fee still gains it", () => {
    const b = price(25, 80000, { ...small, capCents: 1000 }, 500);
    expect(b.clamp).toBe("cap");
    expect(b.deliveryCents).toBe(1000);
    expect(b.totalCents).toBe(1300);
  });
});

describe("P6 — the customer's lines", () => {
  it("sum to the total for every case above", () => {
    const overrides: Partial<EffyPlanValues>[] = [
      {}, { freeOverCents: 8000 }, { smallOrderUnderCents: 2000, smallOrderFeeCents: 300 },
      { freeOverCents: 8000, smallOrderUnderCents: 2000, smallOrderFeeCents: 300 }, { capCents: 500 }, { floorCents: 0 },
    ];
    for (const o of overrides)
      for (const km of [0, 10, 10.01, 25, 900])
        for (const g of [1, 5001, 80000])
          for (const basket of [0, 1999, 2000, 7999, 8000, 20000])
            for (const premium of [0, 30, 200, 2000]) {
              const b = price(km, g, o, basket, premium);
              expect(sum(b)).toBe(b.totalCents);
              for (const l of feeLines(b)) expect(l.cents).not.toBe(0);
            }
  });

  it("an ordinary order is one line", () => {
    expect(feeLines(price(15, 6000))).toEqual([{ kind: "delivery", cents: 650 }]);
  });

  it("a surcharged window is its own line", () => {
    expect(feeLines(price(15, 6000, {}, 5000, 200))).toEqual([
      { kind: "delivery", cents: 650 },
      { kind: "window_surcharge", cents: 200 },
    ]);
  });

  it("at the maximum the surcharge line is what the window REALLY added — here, less than its premium", () => {
    // Without the premium: 300+500+400 = 1200. With $5 more: 1700 → held at 1500. The window added $3.
    const b = price(25, 80000, {}, 5000, 500);
    expect(feeLines(b)).toEqual([
      { kind: "delivery", cents: 1200 },
      { kind: "window_surcharge", cents: 300 },
    ]);
  });

  it("already at the maximum, a dearer window adds no line at all", () => {
    const b = price(25, 80000, { capCents: 1000 }, 5000, 500);
    expect(feeLines(b)).toEqual([{ kind: "delivery", cents: 1000 }]);
  });

  it("free delivery shows what was waived, surcharge and all", () => {
    expect(feeLines(price(15, 6000, { freeOverCents: 8000 }, 9000, 200))).toEqual([
      { kind: "delivery", cents: 650 },
      { kind: "window_surcharge", cents: 200 },
      { kind: "free_delivery", cents: -850 },
    ]);
  });

  it("a small order shows its fee apart from delivery", () => {
    expect(feeLines(price(1, 1, { smallOrderUnderCents: 2000, smallOrderFeeCents: 300 }, 100))).toEqual([
      { kind: "delivery", cents: 400 },
      { kind: "small_order", cents: 300 },
    ]);
  });
});

describe("P18 — courierFee", () => {
  const courier = (over: Partial<CourierPlanValues> = {}): CourierPlanValues => ({
    baseCents: 900,
    weightBands: [{ upperGrams: 5000, addCents: 0 }, { upperGrams: 20000, addCents: 425 }],
    freeOverCents: null,
    stepCents: 50, floorCents: 900, capCents: 2000,
    ...over,
  });

  it("is the flat amount plus the weight band, rounded up", () => {
    expect(courierFee({ grams: 1000, basketCents: 5000, plan: courier() }).totalCents).toBe(900);
    // 900 + 425 = 1325 → 1350
    expect(courierFee({ grams: 9000, basketCents: 5000, plan: courier() }).totalCents).toBe(1350);
    expect(courierFee({ grams: 90000, basketCents: 5000, plan: courier() }).totalCents).toBe(1350);
  });

  it("is held between its own minimum and maximum", () => {
    expect(courierFee({ grams: 9000, basketCents: 0, plan: courier({ capCents: 1000 }) }).totalCents).toBe(1000);
    expect(courierFee({ grams: 1, basketCents: 0, plan: courier({ baseCents: 100 }) }).totalCents).toBe(900);
  });

  it("is never free unless ITS OWN amount is set", () => {
    expect(courierFee({ grams: 1000, basketCents: 99_999_900, plan: courier() }).totalCents).toBe(900);
    const b = courierFee({ grams: 1000, basketCents: 10000, plan: courier({ freeOverCents: 10000 }) });
    expect(b.totalCents).toBe(0);
    expect(feeLines(b)).toEqual([{ kind: "delivery", cents: 900 }, { kind: "free_delivery", cents: -900 }]);
  });

  it("has no distance, no window and no small-order fee", () => {
    const b = courierFee({ grams: 9000, basketCents: 1, plan: courier() });
    expect(b.km).toBeNull();
    expect(b.distanceCents).toBe(0);
    expect(b.premiumCents).toBe(0);
    expect(b.smallOrderCents).toBe(0);
    expect(feeLines(b)).toEqual([{ kind: "delivery", cents: 1350 }]);
  });
});

describe("basketValueCents", () => {
  it("is the goods after a promotion, never below zero", () => {
    expect(basketValueCents(8500, 1000)).toBe(7500);
    expect(basketValueCents(500, 900)).toBe(0);
    expect(basketValueCents(8000, 0)).toBe(8000);
  });
});
