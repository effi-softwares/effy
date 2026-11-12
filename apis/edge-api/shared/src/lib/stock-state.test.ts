import { describe, expect, it } from "vitest";

import { stockState } from "./stock-state";

const facts = { productId: "p1", variantId: "v1", threshold: null, shopDefaultThreshold: 4 };

describe("stockState (054, 114)", () => {
  it("114: shows what checkouts hold and what is left, and never changes the shelf count", () => {
    expect(stockState({ ...facts, tracked: true, onHand: 5, held: 2 })).toMatchObject({ onHand: 5, held: 2, leftToSell: 3 });
  });

  it("114: more held than the shelf (a lowered count) leaves 0 to sell, never negative", () => {
    expect(stockState({ ...facts, tracked: true, onHand: 1, held: 3 })).toMatchObject({ onHand: 1, held: 3, leftToSell: 0 });
  });

  it("114 FR-018: out and low judge the shelf, not the holds", () => {
    const s = stockState({ ...facts, tracked: true, onHand: 10, held: 10 });
    expect(s).toMatchObject({ outOfStock: false, low: false, leftToSell: 0 });
    expect(stockState({ ...facts, tracked: true, onHand: 3, held: 0 }).low).toBe(true);
  });

  it("an uncounted size has no held or left numbers", () => {
    expect(stockState({ ...facts, tracked: false, onHand: null, held: 4 })).toMatchObject({ onHand: null, held: null, leftToSell: null });
  });
});
