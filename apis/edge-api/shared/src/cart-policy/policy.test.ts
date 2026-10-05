import { describe, expect, it } from "vitest";

import {
  defaultCartPolicy,
  hasMinimum,
  loadCartPolicy,
  meetsMinimum,
  policyFromRow,
  remainingToMinimum,
  type CartPolicy,
} from "./policy";

const policy = (minimumSubtotalCents: number): CartPolicy => ({ ...defaultCartPolicy(), minimumSubtotalCents });

describe("minimum spend", () => {
  it("a zero minimum is NOT a minimum in force — the cart shows nothing about one", () => {
    expect(hasMinimum(defaultCartPolicy())).toBe(false);
    expect(hasMinimum(policy(1))).toBe(true); // one cent is a minimum
  });

  it.each([
    ["well below", 1800, 700, false],
    ["one cent below", 2499, 1, false],
    ["exactly at the minimum is ALLOWED", 2500, 0, true],
    ["above", 9999, 0, true],
    ["empty cart is below", 0, 2500, false],
  ])("%s", (_name, payable, want, meets) => {
    const p = policy(2500); // $25.00
    expect(remainingToMinimum(p, payable)).toBe(want);
    expect(meetsMinimum(p, payable)).toBe(meets);
  });

  it("with no minimum nothing is ever remaining — a missing policy must never block checkout", () => {
    for (const payable of [0, 1, 999999]) {
      expect(remainingToMinimum(defaultCartPolicy(), payable)).toBe(0);
      expect(meetsMinimum(defaultCartPolicy(), payable)).toBe(true);
    }
  });
});

describe("defaults and the row", () => {
  it("fall back to the pre-027 ceilings and AUD", () => {
    expect(defaultCartPolicy()).toEqual({
      minimumSubtotalCents: 0, currency: "AUD", maxLineQuantity: 99, maxDistinctItems: 100,
    });
  });

  it("a missing row is the default, not an error", async () => {
    expect(await loadCartPolicy({ query: async () => ({ rows: [] }) as never })).toEqual(defaultCartPolicy());
  });

  it("parses the minimum to cents", () => {
    const row = { minimum_subtotal_amount: "25.00", currency: "AUD", max_line_quantity: 20, max_distinct_items: 50 };
    expect(policyFromRow(row)).toEqual({
      minimumSubtotalCents: 2500, currency: "AUD", maxLineQuantity: 20, maxDistinctItems: 50,
    });
  });

  it("refuses to believe a nonsensical ceiling — it would silently empty every cart", () => {
    const row = { minimum_subtotal_amount: "0.00", currency: "AUD", max_line_quantity: 0, max_distinct_items: -3 };
    expect(policyFromRow(row)).toMatchObject({ maxLineQuantity: 99, maxDistinctItems: 100 });
  });
});
