import { describe, expect, it } from "vitest";

import { allocate, type EngineContext, melbourneContext, pricePromotions } from "./engine";
import { basketOf, candidateOf, ENGINE_FIXTURES } from "./fixtures";

/** The engine against every scenario and edge case in fixtures.ts. */
const WEDNESDAY_NOON: EngineContext = { isoDay: 3, minuteOfDay: 720 };
const all = ENGINE_FIXTURES;

describe("pricePromotions — the spec's scenarios and edge cases", () => {
  for (const f of all) {
    it(f.name, () => {
      const out = pricePromotions(basketOf(f), f.candidates.map(candidateOf), f.ctx ?? WEDNESDAY_NOON);
      expect(out.goodsDiscountCents).toBe(f.expect.goods);
      expect(out.deliveryDiscountCents).toBe(f.expect.delivery ?? 0);
      expect(out.applied.map((a) => a.promotionId)).toEqual(f.expect.applied);
      if (f.expect.lines) expect(out.lineDiscounts).toEqual(f.expect.lines);
      if (f.expect.notApplied) expect(out.notApplied).toEqual(f.expect.notApplied);
      if (f.expect.awaiting) expect(out.applied.filter((a) => a.awaitingDeliveryFee).map((a) => a.promotionId)).toEqual(f.expect.awaiting);
      // The invariants every outcome keeps.
      for (const l of basketOf(f).lines) expect(out.lineDiscounts[l.lineId] ?? 0).toBeLessThanOrEqual(l.unitCents * l.quantity);
      expect(out.goodsDiscountCents).toBe(Object.values(out.lineDiscounts).reduce((a, b) => a + b, 0));
      expect(out.applied.reduce((a, p) => a + p.goodsCents, 0)).toBe(out.goodsDiscountCents);
    });
  }

  it("prices nothing when there is nothing to price", () => {
    expect(pricePromotions({ lines: [], deliveryType: null, deliveryFeeCents: null }, [], WEDNESDAY_NOON).applied).toEqual([]);
  });
});

describe("allocate", () => {
  it("never gives a line more than its weight, and always hands out the whole amount", () => {
    const out = allocate(1000, [["a", 1], ["b", 1], ["c", 5000]]);
    expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(1000);
    expect(out.get("a") ?? 0).toBeLessThanOrEqual(1);
  });
  it("hands out at most the total weight", () => {
    const out = allocate(500, [["a", 100], ["b", 50]]);
    expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(150);
  });
});

describe("melbourneContext", () => {
  it("reads Melbourne's day and time, not UTC's", () => {
    // 2026-10-20T23:30Z is Wednesday 10:30 in Melbourne (AEDT, UTC+11).
    expect(melbourneContext(new Date("2026-10-20T23:30:00Z"))).toEqual({ isoDay: 3, minuteOfDay: 630 });
  });
});
