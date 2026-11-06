import { describe, expect, it } from "vitest";

import { parseWrite } from "./promotion-service";
import { PromoError } from "./types";

/** 108: an information banner's write - words, where a tap leads, a schedule and groups; none of an offer's settings. */
const base = { name: "Range - home hero", kind: "banner", headline: "Groceries to home appliances, from one place", link: { kind: "search" } };

const refused = (body: Record<string, unknown>): string[] => {
  try {
    parseWrite(body, null);
  } catch (e) {
    if (e instanceof PromoError) return (e.fields ?? []).map((f) => f.field);
    throw e;
  }
  return [];
};

describe("108 — information banner writes", () => {
  it("accepts words, a link, a schedule and groups", () => {
    const { w } = parseWrite({ ...base, link: { kind: "category", categoryId: "11111111-1111-1111-1111-111111111111" }, daysOfWeek: [1, 2] }, null);
    expect(w).toMatchObject({ kind: "banner", linkKind: "category", linkCategoryId: "11111111-1111-1111-1111-111111111111", linkProductId: null, daysOfWeek: [1, 2] });
    expect(w.trigger).toBeUndefined();
    expect(w.valueType).toBeUndefined();
  });

  it("refuses every offer setting by name", () => {
    expect(refused({ ...base, trigger: "automatic", percentOff: 10, budget: "50.00", audience: "everyone", sharedCode: "HELLO" })).toEqual([
      "trigger",
      "percentOff",
      "audience",
      "budget",
      "sharedCode",
    ]);
  });

  it("needs a headline and somewhere for a tap to go", () => {
    expect(refused({ name: "x", kind: "banner" })).toEqual(expect.arrayContaining(["link", "headline"]));
    expect(refused({ ...base, link: { kind: "product" } })).toEqual(["link.productId"]);
  });

  it("knows its live values and refuses a typo", () => {
    expect(refused({ ...base, headline: "Free over {free_delivery_amount}" })).toEqual([]);
    expect(refused({ ...base, headline: "Free over {free_delivery}" })).toEqual(["headline"]);
  });

  it("keeps an offer's words as typed: no live values, and no link", () => {
    const offer = { name: "o", kind: "cart", trigger: "automatic", valueType: "percent", percentOff: 10 };
    expect(refused({ ...offer, headline: "Free over {free_delivery_amount}" })).toEqual(["headline"]);
    expect(refused({ ...offer, link: { kind: "sale" } })).toEqual(["link"]);
  });
});
