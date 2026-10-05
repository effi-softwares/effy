import { describe, expect, it } from "vitest";

import {
  discountFor, evaluatePromo, lapsedDetail, normalisePromoCode, promoLabel, refusalDetail,
  type PromoCode, type PromoRefusal, type PromoUsage,
} from "./promo";

const now = new Date("2026-07-30T12:00:00Z");
const yesterday = new Date(now.getTime() - 24 * 3600_000);
const tomorrow = new Date(now.getTime() + 24 * 3600_000);
const none: PromoUsage = { total: 0, byThisShopper: 0 };

const base: PromoCode = {
  id: "p", code: "X", kind: "percentage", percentOff: 0, amountOffCents: 0, minimumSubtotalCents: 0,
  startsAt: null, endsAt: null, maxRedemptions: null, maxPerCustomer: null, status: "active",
};
const percent = (pct: number, over: Partial<PromoCode> = {}): PromoCode => ({ ...base, id: "p1", code: "SPRING20", percentOff: pct, ...over });
const fixed = (cents: number, over: Partial<PromoCode> = {}): PromoCode => ({ ...base, id: "p2", code: "TENOFF", kind: "fixed", amountOffCents: cents, ...over });

describe("every refusal is distinguishable", () => {
  it.each<[string, PromoCode, PromoUsage, number, PromoRefusal]>([
    ["disabled", percent(20, { status: "disabled" }), none, 5000, "promo_disabled"],
    ["not started", percent(20, { startsAt: tomorrow }), none, 5000, "promo_not_started"],
    ["expired", percent(20, { endsAt: yesterday }), none, 5000, "promo_expired"],
    ["exhausted overall", percent(20, { maxRedemptions: 1 }), { total: 1, byThisShopper: 0 }, 5000, "promo_exhausted"],
    ["already used by this shopper", percent(20, { maxPerCustomer: 1 }), { total: 0, byThisShopper: 1 }, 5000, "promo_already_used"],
    ["nothing payable", percent(20), none, 0, "promo_not_applicable"],
    ["below the code's minimum", fixed(1000, { minimumSubtotalCents: 5000 }), none, 4999, "promo_below_minimum"],
  ])("%s", (_name, code, usage, payable, want) => {
    expect(evaluatePromo(code, usage, payable, now)).toEqual({ ok: false, reason: want });
  });
});

describe("discount arithmetic", () => {
  it("a valid percentage code discounts", () => {
    expect(evaluatePromo(percent(20), none, 5000, now)).toEqual({ ok: true, discountCents: 1000 }); // 20% of $50
  });

  it("a percentage rounds DOWN to the cent — never in the shopper's favour by accident", () => {
    expect(evaluatePromo(percent(33), none, 1000, now)).toEqual({ ok: true, discountCents: 330 });
    expect(discountFor(percent(33), 1001)).toBe(330); // 330.33 → 330
    expect(discountFor(percent(15), 999)).toBe(149); // 149.85 → 149
  });

  it("a fixed code is capped at the cart value — the total never goes below zero", () => {
    expect(evaluatePromo(fixed(99900), none, 2000, now)).toEqual({ ok: true, discountCents: 2000 });
  });

  it("is always a whole number of cents", () => {
    for (const pct of [1, 7, 33, 50, 99]) for (const cents of [1, 99, 101, 12345]) {
      expect(Number.isInteger(discountFor(percent(pct), cents))).toBe(true);
    }
  });

  it("an unknown kind discounts nothing", () => {
    expect(discountFor({ ...base, kind: "bogof" }, 5000)).toBe(0);
  });
});

describe("boundaries", () => {
  it("a code starting exactly now is usable; one ending exactly now is expired", () => {
    expect(evaluatePromo(percent(10, { startsAt: now }), none, 5000, now).ok).toBe(true);
    expect(evaluatePromo(percent(10, { endsAt: now }), none, 5000, now)).toEqual({ ok: false, reason: "promo_expired" });
  });

  it("exactly at the code's minimum applies", () => {
    expect(evaluatePromo(fixed(1000, { minimumSubtotalCents: 5000 }), none, 5000, now).ok).toBe(true);
  });

  it("an uncapped code never exhausts", () => {
    expect(evaluatePromo(percent(10), { total: 9999, byThisShopper: 50 }, 5000, now).ok).toBe(true);
  });

  it("a withdrawn code is reported as disabled even when it is also expired — lifecycle first", () => {
    expect(evaluatePromo(percent(10, { status: "disabled", endsAt: yesterday }), none, 5000, now)).toEqual({ ok: false, reason: "promo_disabled" });
  });
});

it.each(["spring20", " SPRING20 ", "Spring20"])("normalises %j to SPRING20", (input) => {
  expect(normalisePromoCode(input)).toBe("SPRING20");
});

it("labels are readable and name no shop", () => {
  expect(promoLabel(percent(20))).toBe("20% off");
  expect(promoLabel(fixed(1050))).toBe("10.50 off");
  expect(promoLabel({ ...base, kind: "other" })).toBe("Discount");
});

describe("what the shopper is told", () => {
  const reasons: PromoRefusal[] = [
    "promo_unknown", "promo_not_started", "promo_expired", "promo_disabled", "promo_exhausted",
    "promo_already_used", "promo_below_minimum", "promo_not_applicable",
  ];

  it("every refusal has its own sentence — never a generic 'invalid'", () => {
    const sentences = reasons.map((r) => refusalDetail(r, fixed(1000, { minimumSubtotalCents: 5000 })));
    expect(new Set(sentences).size).toBe(reasons.length);
    for (const s of sentences) expect(s).not.toMatch(/invalid/i);
  });

  it("the minimum is stated as an amount", () => {
    expect(refusalDetail("promo_below_minimum", fixed(1000, { minimumSubtotalCents: 5000 }))).toContain("50.00");
    expect(lapsedDetail("promo_below_minimum", fixed(1000, { minimumSubtotalCents: 2550 }))).toContain("25.50");
  });
});
