import { describe, expect, it } from "vitest";

import { CURRENCY, formatCents, parseCents } from "./money";

describe("parseCents", () => {
  it.each([
    ["5.00", 500],
    ["5", 500],
    ["5.5", 550],
    ["0.99", 99],
    ["12.34", 1234],
    ["0", 0],
    ["-3.50", -350],
    ["5.009", 500], // truncates beyond 2dp
    [" 7.10 ", 710],
    [".5", 50],
  ])("%s → %d", (input, want) => {
    expect(parseCents(input)).toBe(want);
  });

  it.each(["abc", "", "  ", "1.x", "1e3", "--1", "1,00"])("refuses %j", (input) => {
    expect(() => parseCents(input)).toThrow();
  });

  it("never passes through a float: 0.1 + 0.2 in cents is exactly 30", () => {
    expect(parseCents("0.1") + parseCents("0.2")).toBe(30);
  });
});

describe("formatCents", () => {
  it.each([
    [500, "5.00"],
    [99, "0.99"],
    [1234, "12.34"],
    [0, "0.00"],
    [-350, "-3.50"],
    [5, "0.05"],
  ])("%d → %s", (input, want) => {
    expect(formatCents(input)).toBe(want);
  });

  it("refuses a fractional cent rather than rounding it silently", () => {
    expect(() => formatCents(1.5)).toThrow();
  });
});

describe("round trip", () => {
  it.each(["5.00", "0.99", "123.45"])("%s survives parse → format", (s) => {
    expect(formatCents(parseCents(s))).toBe(s);
  });
});

it("the platform has one currency", () => {
  expect(CURRENCY).toBe("AUD");
});
