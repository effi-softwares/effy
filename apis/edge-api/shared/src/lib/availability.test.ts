import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_COLUMNS,
  availabilityPredicate,
  outOfStock,
  purchasable,
  STATUS_ACTIVE,
} from "./availability";

// The truth table is the specification. Every row states a shopper-visible fact.
const table: Array<[string, string, boolean, number | null, boolean, boolean]> = [
  // ── Untracked: identical to how every product behaved before 054 (FR-002, SC-006) ──
  ["active and untracked is purchasable, whatever the count column says", "active", false, null, true, false],
  ["an untracked product with a stale count is still unlimited", "active", false, 0, true, false],
  // ── Tracked ──
  ["active, tracked, in stock", "active", true, 3, true, false],
  ["active, tracked, one left", "active", true, 1, true, false],
  ["active, tracked, empty shelf", "active", true, 0, false, true],
  // ── The operator's own switch still wins (A3) ──
  ["unavailable beats stock: the operator stopped selling it", "unavailable", true, 9, false, false],
  ["draft is not sellable however much is on the shelf", "draft", true, 9, false, false],
  ["archived is not sellable", "archived", true, 9, false, false],
  ["unavailable and untracked", "unavailable", false, null, false, false],
  // ── Fail-closed on a state the CHECK constraint makes unrepresentable ──
  ["tracked with no count is refused, not assumed available", "active", true, null, false, true],
];

describe("purchasable / outOfStock", () => {
  it.each(table)("%s", (_name, status, tracked, onHand, canBuy, empty) => {
    expect(purchasable(status, tracked, onHand)).toBe(canBuy);
    expect(outOfStock(status, tracked, onHand)).toBe(empty);
  });

  it("a withdrawn product is NOT 'out of stock' — it is not coming back", () => {
    expect(outOfStock("active", true, 0)).toBe(true);
    expect(outOfStock("archived", true, 0)).toBe(false);
  });
});

describe("availabilityPredicate", () => {
  const sql = availabilityPredicate("p");

  it("reads exactly the three columns the in-memory twin reads, under the caller's alias", () => {
    for (const col of ["p.status", "p.stock_tracked", "p.stock_on_hand"]) expect(sql).toContain(col);
    for (const col of AVAILABILITY_COLUMNS.split(", ")) expect(sql).toContain(`p.${col}`);
    expect(sql).toContain(`'${STATUS_ACTIVE}'`);
  });

  it("tests NOT stock_tracked BEFORE the count, so an untracked NULL is never reached", () => {
    expect(sql.indexOf("NOT p.stock_tracked")).toBeLessThan(sql.indexOf("p.stock_on_hand > 0"));
  });

  it("is an AND of status and stock, not a coalesce of one into the other", () => {
    expect(sql).toMatch(/status = 'active' AND \(/);
  });
});
