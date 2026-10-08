import { describe, expect, it } from "vitest";

import { effyFee, feeLines } from "./engine";
import { feeDTO, offerDTO, storedBreakdown } from "./fee-wire";
import type { Plan } from "./plan";
import type { PricedFee } from "./quote";

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: "plan-1", name: "Spring", kind: "effy", isActive: true, activatedAt: null, baseCents: 300,
  distanceBands: [{ upperKm: 20, addCents: 200 }, { upperKm: null, addCents: 500 }],
  weightBands: [{ upperGrams: 10000, addCents: 100 }],
  freeOverCents: null, smallOrderUnderCents: null, smallOrderFeeCents: 0,
  todayPremiumCents: 200, slotPremiumCents: new Map(), stepCents: 50, floorCents: 400, capCents: 4000,
  ...over,
});

function priced(p: Plan, basketCents: number, premiumCents: number): PricedFee {
  const breakdown = effyFee({
    km: 12.4, grams: 6200, basketCents, premiumCents,
    plan: { ...p, distanceBands: p.distanceBands, weightBands: p.weightBands },
  });
  return { planId: p.id, planName: p.name, slotId: premiumCents > 0 ? "slot-1" : null, windowIsToday: premiumCents > 0, breakdown, lines: feeLines(breakdown), totalCents: breakdown.totalCents };
}

describe("feeDTO — what a customer is given", () => {
  it("is lines and a total, as 2-dp strings, and nothing else", () => {
    const dto = feeDTO(priced(plan(), 5400, 200));
    expect(dto).toEqual({
      lines: [{ kind: "delivery", amount: "6.00" }, { kind: "window_surcharge", amount: "2.00" }],
      totalAmount: "8.00",
    });
    expect(Object.keys(dto)).toEqual(["lines", "totalAmount"]);
  });

  it("the free-delivery line is negative, and the lines still sum to the total", () => {
    const dto = feeDTO(priced(plan({ freeOverCents: 5000 }), 5400, 200));
    expect(dto.lines.at(-1)).toEqual({ kind: "free_delivery", amount: "-8.00" });
    expect(dto.totalAmount).toBe("0.00");
  });
});

describe("storedBreakdown — what the order keeps", () => {
  it("names the plan, the inputs and every step, with the same lines the customer saw", () => {
    const fee = priced(plan(), 5400, 200);
    expect(storedBreakdown(fee)).toEqual({
      v: 1, kind: "effy", plan: { id: "plan-1", name: "Spring" },
      inputs: { km: 12.4, grams: 6200, basketCents: 5400, slotId: "slot-1", windowIsToday: true },
      parts: {
        baseCents: 300, distanceCents: 200, distanceBandUpperKm: 20, weightCents: 100, weightBandUpperGrams: 10000,
        premiumCents: 200, rawCents: 800, roundedCents: 800, clamp: null, deliveryCents: 800, freeApplied: false,
        smallOrderCents: 0, totalCents: 800,
      },
      lines: feeDTO(fee).lines,
    });
  });
});

describe("offerDTO — what a cart can say before there is an address", () => {
  it("unset rules are null, never zero", () => {
    expect(offerDTO(plan())).toEqual({ freeDeliveryOverAmount: null, smallOrderUnderAmount: null, smallOrderFeeAmount: null });
  });

  it("set rules are amounts", () => {
    expect(offerDTO(plan({ freeOverCents: 8000, smallOrderUnderCents: 2000, smallOrderFeeCents: 300 }))).toEqual({
      freeDeliveryOverAmount: "80.00", smallOrderUnderAmount: "20.00", smallOrderFeeAmount: "3.00",
    });
  });
});
