import { describe, expect, it } from "vitest";

import { customerPrice, customerPriceCents, fromCents, toCents, validateMargin } from "./margin";

describe("067 — Effy's margin", () => {
  it("a percentage is added on top of the shop price", () => {
    expect(customerPrice("10.00", { kind: "percent", value: "20" })).toBe("12.00");
    expect(customerPrice("10.00", { kind: "percent", value: "12.5" })).toBe("11.25");
  });

  it("an amount is added as it is", () => {
    expect(customerPrice("10.00", { kind: "amount", value: "2.00" })).toBe("12.00");
    expect(customerPrice("0.99", { kind: "amount", value: "0.01" })).toBe("1.00");
  });

  /** FR-033 — "not set" is not zero, but it prices the same. */
  it("no margin means the customer pays the shop's price", () => {
    expect(customerPrice("7.25", null)).toBe("7.25");
  });

  it("zero is a real margin and changes nothing", () => {
    expect(customerPrice("7.25", { kind: "percent", value: "0" })).toBe("7.25");
    expect(customerPrice("7.25", { kind: "amount", value: "0" })).toBe("7.25");
  });

  /** ⚠ The float trap: 9.99 × 1.125 = 11.23875 → 11.24, and must not come out 11.23. */
  it("⚠ rounds a percentage half up to the cent, exactly once", () => {
    expect(customerPrice("9.99", { kind: "percent", value: "12.5" })).toBe("11.24");
    expect(customerPrice("0.10", { kind: "percent", value: "5" })).toBe("0.11"); // 0.105 → up
    expect(customerPrice("0.10", { kind: "percent", value: "4" })).toBe("0.10"); // 0.104 → down
    expect(customerPrice("19.99", { kind: "percent", value: "33.3333" })).toBe("26.65");
    expect(customerPriceCents(1, { kind: "percent", value: "50" })).toBe(2); // 1.5 → 2
  });

  it("is exact on prices a float would smear", () => {
    expect(customerPrice("1.10", { kind: "percent", value: "10" })).toBe("1.21");
    expect(customerPrice("99999.99", { kind: "percent", value: "100" })).toBe("199999.98");
  });

  it("accepts what a reviewer can type", () => {
    expect(validateMargin({ kind: "percent", value: "12.5" })).toEqual({ ok: true, margin: { kind: "percent", value: "12.5" } });
    expect(validateMargin({ kind: "amount", value: " 2.00 " })).toEqual({ ok: true, margin: { kind: "amount", value: "2.00" } });
    expect(validateMargin({ kind: "percent", value: 20 })).toEqual({ ok: true, margin: { kind: "percent", value: "20" } });
    expect(validateMargin({ kind: "amount", value: "0" }).ok).toBe(true);
  });

  /** FR-029. */
  it("refuses a negative, a non-number, an unknown kind and an absent margin", () => {
    expect(validateMargin({ kind: "percent", value: "-5" })).toEqual({ ok: false, reason: "negative" });
    expect(validateMargin({ kind: "amount", value: "abc" })).toEqual({ ok: false, reason: "invalid" });
    expect(validateMargin({ kind: "ratio", value: "1" })).toEqual({ ok: false, reason: "invalid" });
    expect(validateMargin({ kind: "percent" })).toEqual({ ok: false, reason: "invalid" });
    expect(validateMargin(null)).toEqual({ ok: false, reason: "invalid" });
    expect(validateMargin({ kind: "percent", value: "" })).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a margin that can only be a typo", () => {
    expect(validateMargin({ kind: "percent", value: "1250" })).toEqual({ ok: false, reason: "too_large" });
    expect(validateMargin({ kind: "percent", value: "1000" }).ok).toBe(true);
  });

  it("converts money without a float", () => {
    expect(toCents("12.34")).toBe(1234);
    expect(toCents("12.3")).toBe(1230);
    expect(toCents("12")).toBe(1200);
    expect(fromCents(5)).toBe("0.05");
    expect(fromCents(1200)).toBe("12.00");
    expect(() => toCents("12.345")).toThrow();
    expect(() => toCents("-1")).toThrow();
  });
});
