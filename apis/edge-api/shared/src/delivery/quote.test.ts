import { describe, expect, it } from "vitest";

import { METHOD_SAME_DAY, METHOD_STANDARD, windowPremiumCents, type Plan } from "./plan";
import { distinctShops, ListedPostcodeUnpricedError, offersSameDay, priceEffyOrder, type PackageQuote } from "./quote";

const SLOT = "slot-evening";

const testPlan = (over: Partial<Plan> = {}): Plan => ({
  id: "plan",
  name: "Test plan",
  kind: "effy",
  isActive: true,
  activatedAt: null,
  baseCents: 0,
  distanceBands: [{ upperKm: 10, addCents: 600 }, { upperKm: null, addCents: 1200 }],
  weightBands: [
    { upperGrams: 2000, addCents: 0 },
    { upperGrams: 5000, addCents: 200 },
    { upperGrams: 10000, addCents: 550 },
  ],
  freeOverCents: null,
  smallOrderUnderCents: null,
  smallOrderFeeCents: 0,
  todayPremiumCents: 300,
  slotPremiumCents: new Map([[SLOT, 150]]),
  stepCents: 50,
  floorCents: 400,
  capCents: 4000,
  ...over,
});

describe("windowPremiumCents", () => {
  const plan = testPlan();

  it("no window adds nothing — a later day is the plain fee", () => {
    expect(windowPremiumCents(plan, null, false)).toBe(0);
    expect(windowPremiumCents(plan, null, true)).toBe(0);
  });

  it("a window today adds the today premium, plus the window's own if it has one", () => {
    expect(windowPremiumCents(plan, "slot-plain", true)).toBe(300);
    expect(windowPremiumCents(plan, SLOT, true)).toBe(450);
  });

  it("the same window on a later day adds only its own premium", () => {
    expect(windowPremiumCents(plan, SLOT, false)).toBe(150);
    expect(windowPremiumCents(plan, "slot-plain", false)).toBe(0);
  });
});

describe("priceEffyOrder", () => {
  it("prices a later day and a window today from one plan — today is dearer by the premium", () => {
    const later = priceEffyOrder(testPlan(), "3121", 3.4, 7000, 5000, null, false);
    const today = priceEffyOrder(testPlan(), "3121", 3.4, 7000, 5000, "slot-plain", true);
    expect(later.totalCents).toBe(1150); // 6.00 + 5.50
    expect(today.totalCents).toBe(1450);
    expect(today.lines).toEqual([{ kind: "delivery", cents: 1150 }, { kind: "window_surcharge", cents: 300 }]);
  });

  it("carries the plan and the choice it was priced for", () => {
    const fee = priceEffyOrder(testPlan(), "3121", 3.4, 100, 5000, SLOT, true);
    expect(fee).toMatchObject({ planId: "plan", planName: "Test plan", slotId: SLOT, windowIsToday: true });
    expect(fee.breakdown.premiumCents).toBe(450);
  });

  it("a plan that cannot price the postcode fails LOUD and names it — never a zero", () => {
    const closed = testPlan({ distanceBands: [{ upperKm: 10, addCents: 600 }] });
    expect(() => priceEffyOrder(closed, "3550", 130, 100, 5000, null, false)).toThrow(ListedPostcodeUnpricedError);
    expect(() => priceEffyOrder(closed, "3550", 130, 100, 5000, null, false)).toThrow(/3550/);
    expect(() => priceEffyOrder(testPlan({ weightBands: [] }), "3121", 3, 100, 5000, null, false)).toThrow(ListedPostcodeUnpricedError);
  });
});

describe("package quote helpers", () => {
  const both: PackageQuote = { shopId: "s", options: [{ method: METHOD_STANDARD }, { method: METHOD_SAME_DAY }] };
  const stdOnly: PackageQuote = { shopId: "s", options: [{ method: METHOD_STANDARD }] };

  it("offersSameDay", () => {
    expect(offersSameDay(both)).toBe(true);
    expect(offersSameDay(stdOnly)).toBe(false);
  });

  it("distinctShops keeps first-appearance order", () => {
    expect(distinctShops([{ shopId: "a", grams: 1 }, { shopId: "b", grams: 1 }, { shopId: "a", grams: 1 }])).toEqual(["a", "b"]);
  });
});
