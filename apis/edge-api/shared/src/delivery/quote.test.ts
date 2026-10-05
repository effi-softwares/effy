import { describe, expect, it } from "vitest";

import { fee } from "./engine";
import { factorMilli, METHOD_SAME_DAY, METHOD_STANDARD, parseMilli, type Plan } from "./plan";
import { distinctShops, feeFor, feeInputs, offersSameDay, standardFeeCents, type PackageQuote } from "./quote";

describe("parseMilli", () => {
  it.each([
    ["1", 1000],
    ["1.8", 1800],
    ["2.400", 2400],
    ["1.05", 1050],
    ["0.5", 500],
    ["1.2345", 1234], // truncated to 3 dp
    [" 1.8 ", 1800],
  ])("%j → %d", (input, want) => {
    expect(parseMilli(input)).toBe(want);
  });

  it("refuses an empty factor", () => {
    expect(() => parseMilli("")).toThrow();
  });
});

const testPlan = (): Plan => ({
  id: "plan",
  roundingStepCents: 50,
  floorCents: 400,
  capCents: 4000,
  standardFactorMilli: 1000, // ×1.0
  sameDayFactorMilli: 1800, // ×1.8
  ringPriceCents: new Map(),
  weightBands: [
    { upperGrams: 2000, addCents: 0 },
    { upperGrams: 5000, addCents: 200 },
    { upperGrams: 10000, addCents: 550 },
  ],
});

describe("feeInputs", () => {
  const plan = testPlan();
  const innerRing = 600; // $6.00

  it("prices standard and same-day from one plan", () => {
    const std = fee(feeInputs(plan, innerRing, 7000, plan.standardFactorMilli));
    const sd = fee(feeInputs(plan, innerRing, 7000, plan.sameDayFactorMilli));
    expect(std).toBe(1150);
    expect(sd).toBe(2100); // 2070 snapped up to the .50 grid
    expect(sd).toBeGreaterThanOrEqual(std);
  });

  it("applies the floor", () => {
    expect(fee(feeInputs(plan, 0, 100, plan.standardFactorMilli))).toBe(400);
  });

  it("selects the factor by method; anything but same_day is standard", () => {
    expect(factorMilli(plan, METHOD_SAME_DAY)).toBe(1800);
    expect(factorMilli(plan, METHOD_STANDARD)).toBe(1000);
    expect(factorMilli(plan, "carrier_pigeon")).toBe(1000);
  });
});

describe("package quote helpers", () => {
  const both: PackageQuote = {
    shopId: "s",
    options: [{ method: METHOD_STANDARD, feeCents: 600 }, { method: METHOD_SAME_DAY, feeCents: 1100 }],
  };
  const stdOnly: PackageQuote = { shopId: "s", options: [{ method: METHOD_STANDARD, feeCents: 600 }] };

  it("feeFor returns the chosen method's fee", () => {
    expect(feeFor(both, METHOD_SAME_DAY)).toEqual({ method: METHOD_SAME_DAY, feeCents: 1100 });
  });

  it("feeFor falls back to standard when same-day is not offered — charged standard, never refused", () => {
    expect(feeFor(stdOnly, METHOD_SAME_DAY)).toEqual({ method: METHOD_STANDARD, feeCents: 600 });
  });

  it("standardFeeCents / offersSameDay", () => {
    expect(standardFeeCents(both)).toBe(600);
    expect(offersSameDay(both)).toBe(true);
    expect(offersSameDay(stdOnly)).toBe(false);
  });

  it("distinctShops keeps first-appearance order", () => {
    expect(distinctShops([{ shopId: "a", grams: 1 }, { shopId: "b", grams: 1 }, { shopId: "a", grams: 1 }])).toEqual(["a", "b"]);
  });
});
