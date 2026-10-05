import { describe, expect, it } from "vitest";

import { fee, weightAddCents, type FeeInputs, type WeightBand } from "./engine";

const step = 50; // $0.50
const floor = 400; // $4.00
const cap40 = 4000; // $40.00
const std = 1000; // ×1.0
const same = 1800; // ×1.8
const inner = 600; // $6.00
const outer = 1200; // $12.00

const bands = (): WeightBand[] => [
  { upperGrams: 2000, addCents: 0 },
  { upperGrams: 5000, addCents: 200 },
  { upperGrams: 10000, addCents: 550 },
];

const base = (ring: number, factor: number, grams: number): FeeInputs => ({
  ringPriceCents: ring, packageGrams: grams, weightBands: bands(),
  factorMilli: factor, stepCents: step, floorCents: floor, capCents: cap40,
});

describe("fee", () => {
  it.each([
    ["standard inner 1500g", base(inner, std, 1500), 600],
    ["standard outer 7000g", base(outer, std, 7000), 1750],
    ["same_day inner 1500g", base(inner, same, 1500), 1100],
    ["same_day outer 30000g (top band)", base(outer, same, 30000), 3150],
    ["standard inner 100g", base(inner, std, 100), 600],
  ])("%s", (_name, input, want) => {
    expect(fee(input)).toBe(want);
  });

  it("a capped fee is still on the step grid", () => {
    const got = fee(base(outer, 2400, 50000)); // ×2.4: base 1750 → 4200 → capped 4000
    expect(got).toBe(cap40);
    expect(got % step).toBe(0);
  });

  it("is always a multiple of the step", () => {
    for (const ring of [0, inner, outer, 9999])
      for (const f of [std, same, 2400])
        for (const g of [1, 1500, 5000, 5001, 10000, 99999]) expect(fee(base(ring, f, g)) % step).toBe(0);
  });

  it("stays within floor and cap", () => {
    for (const ring of [0, inner, outer, 100000])
      for (const f of [std, same, 5000])
        for (const g of [1, 3000, 200000]) {
          const got = fee(base(ring, f, g));
          expect(got).toBeGreaterThanOrEqual(floor);
          expect(got).toBeLessThanOrEqual(cap40);
        }
  });

  it("never rounds DOWN below the raw amount", () => {
    for (const ring of [inner, outer, 733])
      for (const f of [std, same, 1333])
        for (const g of [1500, 7000]) {
          const input = base(ring, f, g);
          const got = fee(input);
          const exactMilli = f * (ring + weightAddCents(g, input.weightBands));
          if (got < cap40) expect(got * 1000).toBeGreaterThanOrEqual(exactMilli);
        }
  });

  it("is monotonic in weight and in ring price", () => {
    let prev = -1;
    for (const g of [1, 2000, 2001, 5000, 5001, 10000, 20000]) {
      const got = fee(base(outer, std, g));
      expect(got).toBeGreaterThanOrEqual(prev);
      prev = got;
    }
    prev = -1;
    for (const ring of [0, 300, 600, 1200, 5000]) {
      const got = fee(base(ring, std, 3000));
      expect(got).toBeGreaterThanOrEqual(prev);
      prev = got;
    }
  });

  it("same-day is never cheaper than standard", () => {
    for (const ring of [0, inner, outer])
      for (const g of [1, 3000, 8000, 50000])
        expect(fee(base(ring, same, g))).toBeGreaterThanOrEqual(fee(base(ring, std, g)));
  });

  it("a package heavier than every band takes the top band", () => {
    expect(fee(base(inner, std, 999999))).toBe(fee(base(inner, std, 10000)));
  });

  it("is deterministic", () => {
    const input = base(outer, same, 7000);
    const first = fee(input);
    for (let i = 0; i < 100; i += 1) expect(fee(input)).toBe(first);
  });
});

describe("weightAddCents", () => {
  const unsorted: WeightBand[] = [
    { upperGrams: 10000, addCents: 550 },
    { upperGrams: 2000, addCents: 0 },
    { upperGrams: 5000, addCents: 200 },
  ];

  it("is independent of band order", () => {
    expect(weightAddCents(7000, unsorted)).toBe(550);
    expect(weightAddCents(1, unsorted)).toBe(0);
    expect(weightAddCents(999999, unsorted)).toBe(550);
  });

  it("adds nothing when the plan has no bands", () => {
    expect(weightAddCents(5000, [])).toBe(0);
  });
});
