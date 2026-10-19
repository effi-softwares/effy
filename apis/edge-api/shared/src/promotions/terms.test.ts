import { describe, expect, it } from "vitest";

import { codeRefusalSentence, endsInOf, givesOf, notAppliedSentence, offerLabelOf, type PromotionWords, termsOf } from "./terms";

const base: PromotionWords = {
  kind: "cart",
  valueType: "percent",
  percentOff: 20,
  amountOffCents: null,
  maxDiscountCents: null,
  bxgy: null,
  covers: null,
  deliveryTypes: ["effy", "courier"],
  audience: "everyone",
  minSubtotalCents: 0,
  minQuantity: null,
  daysOfWeek: null,
  minuteFrom: null,
  minuteTo: null,
  maxUsesPerCustomer: null,
};

describe("terms — one composer for every client and back-office", () => {
  it("says what each kind gives", () => {
    expect(givesOf({ ...base, maxDiscountCents: 1500 })).toBe("20% off your order, up to $15");
    expect(givesOf({ ...base, kind: "item", percentOff: 15, covers: "Dairy & eggs" })).toBe("15% off Dairy & eggs");
    expect(givesOf({ ...base, kind: "item", valueType: "amount", percentOff: null, amountOffCents: 100, covers: "Brand X" })).toBe("$1 off each Brand X");
    expect(givesOf({ ...base, kind: "bxgy", valueType: "free", percentOff: null, bxgy: { buy: 2, get: 1, maxPerOrder: null }, covers: "yoghurts" })).toBe(
      "Buy 2 get 1 free on yoghurts",
    );
    expect(givesOf({ ...base, kind: "delivery", valueType: "free", percentOff: null })).toBe("Free delivery");
  });

  it("labels an offer briefly", () => {
    expect(offerLabelOf({ ...base, percentOff: 12.5 })).toBe("12.5% off");
    expect(offerLabelOf({ ...base, valueType: "amount", percentOff: null, amountOffCents: 250 })).toBe("$2.50 off");
    expect(offerLabelOf({ ...base, kind: "bxgy", valueType: "percent", percentOff: 50, bxgy: { buy: 1, get: 1, maxPerOrder: null } })).toBe("Buy 1 get 1 50% off");
  });

  it("states every condition, and nothing when there is none", () => {
    expect(termsOf(base)).toBeNull();
    expect(
      termsOf({
        ...base,
        minSubtotalCents: 3000,
        audience: "first_order",
        deliveryTypes: ["effy"],
        daysOfWeek: [1, 2, 3, 4, 5],
        minuteFrom: 660,
        minuteTo: 840,
        maxUsesPerCustomer: 1,
      }),
    ).toBe("On orders over $30.00 · Your first order only · Delivered by Effy only · Weekdays 11am–2pm · Once per customer");
  });

  it("says how long is left in the 028 wording", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    expect(endsInOf(null, now)).toBeNull();
    expect(endsInOf(new Date("2026-10-20T05:00:00Z"), now)).toBe("Ends in 5 hours");
    expect(endsInOf(new Date("2026-10-21T05:00:00Z"), now)).toBe("Ends tomorrow");
    expect(endsInOf(new Date("2026-10-23T05:00:00Z"), now)).toBe("Ends in 3 days");
  });

  it("explains why an offer does not apply", () => {
    expect(notAppliedSentence("below_minimum", { ...base, valueType: "amount", percentOff: null, amountOffCents: 500 }, { shortfallCents: 600 })).toBe(
      "Add $6.00 more to get $5 off.",
    );
    expect(notAppliedSentence("wrong_time", { ...base, daysOfWeek: [1, 2, 3, 4, 5], minuteFrom: 660, minuteTo: 840 })).toBe("Available weekdays 11am–2pm.");
    expect(notAppliedSentence("not_combined", base, { appliedInstead: "SAVE15" })).toBe("Can't be used with SAVE15, which saves you more.");
    expect(codeRefusalSentence("promo_not_eligible", { ...base, audience: "first_order" })).toBe("That code is for a first order only.");
  });
});
