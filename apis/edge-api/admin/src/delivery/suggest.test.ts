import { describe, expect, it } from "vitest";

import { haversineKm, ringForDistance, type SuggestRing } from "./suggest";

describe("haversineKm", () => {
  it("is ~0 for the same point", () => {
    expect(haversineKm(-37.81, 144.96, -37.81, 144.96)).toBeCloseTo(0, 5);
  });

  it("measures Melbourne CBD → Ballarat at ~100 km", () => {
    // -37.8142,144.9632 (Melbourne) → -37.5617,143.8565 (Ballarat) ≈ 105 km straight-line.
    const km = haversineKm(-37.8142, 144.9632, -37.5617, 143.8565);
    expect(km).toBeGreaterThan(95);
    expect(km).toBeLessThan(115);
  });
});

describe("ringForDistance", () => {
  const rings: SuggestRing[] = [
    { id: "inner", suggestUpperKm: 10 },
    { id: "middle", suggestUpperKm: 25 },
    { id: "outer", suggestUpperKm: 50 },
    { id: "extended", suggestUpperKm: null }, // open-ended
  ];

  it("picks the smallest band ≥ the distance", () => {
    expect(ringForDistance(5, rings)).toBe("inner");
    expect(ringForDistance(10, rings)).toBe("inner"); // inclusive upper bound
    expect(ringForDistance(11, rings)).toBe("middle");
    expect(ringForDistance(40, rings)).toBe("outer");
  });

  it("uses the open-ended ring beyond every bounded band", () => {
    expect(ringForDistance(500, rings)).toBe("extended");
  });

  it("falls back to the furthest bounded ring when there is no open-ended one", () => {
    const bounded = rings.filter((r) => r.suggestUpperKm != null);
    expect(ringForDistance(500, bounded)).toBe("outer");
  });

  it("returns null when there are no rings", () => {
    expect(ringForDistance(5, [])).toBeNull();
  });
});
