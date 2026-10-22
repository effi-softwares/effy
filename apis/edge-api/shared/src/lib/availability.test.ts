import { describe, expect, it } from "vitest";

import {
  outOfStock,
  productAvailableSql,
  purchasable,
  STATUS_ACTIVE,
  VARIANT_AVAILABILITY_COLUMNS,
  VARIANT_STATE_ACTIVE,
  variantPurchasableSql,
} from "./availability";

// The truth table is the specification. Every row states a shopper-visible fact.
// [name, product status, variant state, tracked, onHand, can buy, out of stock]
const table: Array<[string, string, string, boolean, number | null, boolean, boolean]> = [
  // ── Untracked: unlimited (054 FR-002) ──
  ["active and untracked is purchasable, whatever the count column says", "active", "active", false, null, true, false],
  ["an untracked variant with a stale count is still unlimited", "active", "active", false, 0, true, false],
  // ── Tracked ──
  ["active, tracked, in stock", "active", "active", true, 3, true, false],
  ["active, tracked, one left", "active", "active", true, 1, true, false],
  ["active, tracked, empty shelf", "active", "active", true, 0, false, true],
  // ── The operator's own switches still win (A3, 098 FR-020) ──
  ["unavailable beats stock: the operator stopped selling the product", "unavailable", "active", true, 9, false, false],
  ["draft is not sellable however much is on the shelf", "draft", "active", true, 9, false, false],
  ["archived is not sellable", "archived", "active", true, 9, false, false],
  ["an inactive variant is not sellable", "active", "inactive", false, null, false, false],
  ["a removed variant is not sellable, and is not 'out of stock' either", "active", "removed", true, 0, false, false],
  // ── Fail-closed on a state the CHECK constraint makes unrepresentable ──
  ["tracked with no count is refused, not assumed available", "active", "active", true, null, false, true],
];

describe("purchasable / outOfStock", () => {
  it.each(table)("%s", (_name, status, state, tracked, onHand, canBuy, empty) => {
    expect(purchasable(status, state, tracked, onHand)).toBe(canBuy);
    expect(outOfStock(status, state, tracked, onHand)).toBe(empty);
  });
});

describe("variantPurchasableSql", () => {
  const sql = variantPurchasableSql("p", "v");

  it("reads exactly the columns the in-memory twin reads, under the caller's aliases", () => {
    for (const col of ["p.status", "v.state", "v.stock_tracked", "v.stock_on_hand"]) expect(sql).toContain(col);
    for (const col of VARIANT_AVAILABILITY_COLUMNS.split(", ").map((c) => c.split(" AS ")[0]!)) expect(sql).toContain(col);
    expect(sql).toContain(`'${STATUS_ACTIVE}'`);
    expect(sql).toContain(`'${VARIANT_STATE_ACTIVE}'`);
  });

  it("tests NOT stock_tracked BEFORE the count, so an untracked NULL is never reached", () => {
    expect(sql.indexOf("NOT v.stock_tracked")).toBeLessThan(sql.indexOf("v.stock_on_hand > 0"));
  });
});

describe("productAvailableSql", () => {
  const sql = productAvailableSql("p");

  it("is the product's status AND an EXISTS over its variants with the same variant rule", () => {
    expect(sql).toMatch(/^p\.status = 'active' AND EXISTS \(/);
    expect(sql).toContain("av.product_id = p.id");
    expect(sql).toContain(variantPurchasableSql("x", "av").replace("x.status = 'active' AND ", ""));
  });
});
