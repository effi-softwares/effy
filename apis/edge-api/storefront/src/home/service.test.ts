import { describe, expect, it } from "vitest";

import type { CardRow } from "../lib/cards";
import type { HomeRepository } from "./repository";
import { CATEGORY_RAIL_MAX, createHomeService, RAIL_PRODUCT_LIMIT } from "./service";

const card = (id: string, available = true): CardRow => ({
  id, name: id, brand: null, price_amount: "1.00", currency: "AUD", compare_at_amount: null, storage_key: null,
  alt_text: null, created_at: new Date("2020-01-01"), created_at_key: "k", available,
});

function build(over: Partial<HomeRepository> = {}, banners = [{ key: "b1" }] as never[]) {
  const limits: number[] = [];
  const repo: HomeRepository = {
    newestCards: async (l) => (limits.push(l), [card("n1")]),
    onSaleCards: async (l) => (limits.push(l), [card("s1")]),
    railCandidates: async (l) => (limits.push(l), [{ key: "dairy", name: "Dairy" }, { key: "bakery", name: "Bakery" }]),
    categoryCards: async (key) => [card(`${key}-1`)],
    ...over,
  };
  return { svc: createHomeService(repo, { banners: async () => banners }, async () => null), limits };
}

describe("home", () => {
  it("assembles rails in a fixed order: featured, on sale, then categories as named", async () => {
    const home = await build().svc.home();
    expect(home.rails.map((r) => [r.key, r.title])).toEqual([
      ["featured", "Featured"], ["on_sale", "On sale"], ["category:dairy", "Dairy"], ["category:bakery", "Bakery"],
    ]);
    expect(home.banners).toHaveLength(1);
  });

  it("asks for the rail and category limits the design fixes", async () => {
    const { svc, limits } = build();
    await svc.home();
    expect(limits).toEqual([RAIL_PRODUCT_LIMIT, RAIL_PRODUCT_LIMIT, CATEGORY_RAIL_MAX]);
  });

  it("omits an empty rail rather than rendering a blank section", async () => {
    const home = await build({ onSaleCards: async () => [], categoryCards: async (k) => (k === "dairy" ? [] : [card("b")]) }).svc.home();
    expect(home.rails.map((r) => r.key)).toEqual(["featured", "category:bakery"]);
  });

  it("a rail never offers a product that cannot be bought, and a rail left empty is dropped", async () => {
    const home = await build({
      newestCards: async () => [card("in"), card("out", false)],
      onSaleCards: async () => [card("gone", false)],
    }).svc.home();
    expect(home.rails[0]?.products.map((p) => p.id)).toEqual(["in"]);
    expect(home.rails.map((r) => r.key)).not.toContain("on_sale");
  });

  it("nothing to show is { banners: [], rails: [] } — both keys present", async () => {
    const home = await build(
      { newestCards: async () => [], onSaleCards: async () => [], railCandidates: async () => [] },
      [],
    ).svc.home();
    expect(home).toEqual({ banners: [], rails: [] });
  });
});
