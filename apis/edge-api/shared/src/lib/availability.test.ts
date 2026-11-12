import { describe, expect, it } from "vitest";

import {
  leftToSell,
  outOfStock,
  productAvailableSql,
  purchasable,
  STATUS_ACTIVE,
  stockHeldSql,
  variantAvailabilityColumns,
  VARIANT_STATE_ACTIVE,
  variantPurchasableSql,
} from "./availability";

// The truth table: [name, product status, variant state, tracked, onHand, held, can buy, out of stock, left to sell]
const table: Array<[string, string, string, boolean, number | null, number, boolean, boolean, number | null]> = [
  // Untracked: unlimited, and holds never matter.
  ["active and untracked is purchasable, whatever the count column says", "active", "active", false, null, 0, true, false, null],
  ["an untracked variant with a stale count is still unlimited", "active", "active", false, 0, 0, true, false, null],
  ["an untracked variant ignores holds left from when it was counted (114 FR-013)", "active", "active", false, null, 4, true, false, null],
  ["active, tracked, in stock", "active", "active", true, 3, 0, true, false, 3],
  ["active, tracked, one left", "active", "active", true, 1, 0, true, false, 1],
  ["active, tracked, empty shelf", "active", "active", true, 0, 0, false, true, 0],
  // 114: other shoppers' live holds take units off what is left to sell.
  ["partly held: what is not held can still be bought", "active", "active", true, 5, 2, true, false, 3],
  ["fully held: nothing left to buy, said as out of stock", "active", "active", true, 2, 2, false, true, 0],
  ["more held than the shelf (the shop lowered its count): left 0, never negative", "active", "active", true, 1, 3, false, true, 0],
  // The operator's own switches still win.
  ["unavailable beats stock: the operator stopped selling the product", "unavailable", "active", true, 9, 0, false, false, 9],
  ["draft is not sellable however much is on the shelf", "draft", "active", true, 9, 0, false, false, 9],
  ["archived is not sellable", "archived", "active", true, 9, 0, false, false, 9],
  ["an inactive variant is not sellable", "active", "inactive", false, null, 0, false, false, null],
  ["a removed variant is not sellable, and is not 'out of stock' either", "active", "removed", true, 0, 0, false, false, 0],
  // Fail closed on a state the check makes unrepresentable.
  ["tracked with no count is refused, not assumed available", "active", "active", true, null, 0, false, true, 0],
];

describe("purchasable / outOfStock / leftToSell", () => {
  it.each(table)("%s", (_name, status, state, tracked, onHand, held, canBuy, empty, left) => {
    expect(purchasable(status, state, tracked, onHand, held)).toBe(canBuy);
    expect(outOfStock(status, state, tracked, onHand, held)).toBe(empty);
    expect(leftToSell(tracked, onHand, held)).toBe(left);
  });
});

describe("stockHeldSql", () => {
  it("counts only live holds on the caller's variant", () => {
    const sql = stockHeldSql("v");
    expect(sql).toContain("public.stock_hold");
    expect(sql).toContain("sth.variant_id = v.id");
    expect(sql).toContain("sth.held_until > now()");
    expect(sql).not.toContain("customer_id");
  });

  it("leaves out one CUSTOMER's own holds when asked", () => {
    expect(stockHeldSql("v", "$1")).toContain("sth.customer_id IS DISTINCT FROM $1");
  });
});

describe("variantPurchasableSql", () => {
  const sql = variantPurchasableSql("p", "v");

  it("reads exactly the columns the in-memory twin reads, under the caller's aliases", () => {
    for (const col of ["p.status", "v.state", "v.stock_tracked", "v.stock_on_hand"]) expect(sql).toContain(col);
    for (const col of ["p.status", "v.state", "v.stock_tracked", "v.stock_on_hand"]) expect(variantAvailabilityColumns()).toContain(col);
    expect(variantAvailabilityColumns("$1")).toContain(`${stockHeldSql("v", "$1")} AS stock_held`);
    expect(sql).toContain(stockHeldSql("v"));
    expect(sql).toContain(`'${STATUS_ACTIVE}'`);
    expect(sql).toContain(`'${VARIANT_STATE_ACTIVE}'`);
  });

  it("tests NOT stock_tracked BEFORE the count, so an untracked NULL is never reached", () => {
    expect(sql.indexOf("NOT v.stock_tracked")).toBeLessThan(sql.indexOf("v.stock_on_hand >"));
  });

  it("passes the shopper through to the held sum", () => {
    expect(variantPurchasableSql("p", "v", "$2")).toContain(stockHeldSql("v", "$2"));
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
