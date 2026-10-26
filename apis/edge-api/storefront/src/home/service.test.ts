import { describe, expect, it } from "vitest";

import type { CardRow } from "../lib/cards";
import type { HomeRepository, RailRow } from "./repository";
import { CATEGORY_RAIL_MAX, createHomeService, RAIL_PRODUCT_LIMIT } from "./service";

const card = (id: string, available = true): CardRow => ({
  id, name: id, brand: null, price_amount: "1.00", currency: "AUD", compare_at_amount: null, storage_key: null,
  alt_text: null, image_widths: null, created_at: new Date("2020-01-01"), created_at_key: "k", available, age_restricted: false,
  price_varies: false, unit_basis: null, variant_id: "v1", pack_quantity: null, pack_unit: null, variant_count: 1, 
});

const on = (rail: string, row: CardRow, title: string | null = null): RailRow => ({ ...row, rail, rail_title: title });

/** The rows the one statement returns: rail order, newest first within a rail. */
const DEFAULT_ROWS: RailRow[] = [
  on("featured", card("n1")),
  on("on_sale", card("s1")),
  on("category:dairy", card("dairy-1"), "Dairy"),
  on("category:bakery", card("bakery-1"), "Bakery"),
];

function build(rows: RailRow[] = DEFAULT_ROWS) {
  const limits: number[][] = [];
  const repo: HomeRepository = { rails: async (l, max) => (limits.push([l, max]), rows) };
  return { svc: createHomeService(repo, async () => null), limits };
}

describe("home", () => {
  it("assembles rails in a fixed order: featured, on sale, then categories as named", async () => {
    const home = await build().svc.home();
    expect(home.rails.map((r) => [r.key, r.title])).toEqual([
      ["featured", "Featured"], ["on_sale", "On sale"], ["category:dairy", "Dairy"], ["category:bakery", "Bakery"],
    ]);
  });

  it("asks for the rail and category limits the design fixes", async () => {
    const { svc, limits } = build();
    await svc.home();
    expect(limits).toEqual([[RAIL_PRODUCT_LIMIT, CATEGORY_RAIL_MAX]]);
  });

  it("keeps each rail's products in the order the statement returned them", async () => {
    const home = await build([on("featured", card("a")), on("featured", card("b")), on("featured", card("c"))]).svc.home();
    expect(home.rails[0]?.products.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("omits a rail with no rows rather than rendering a blank section", async () => {
    const home = await build([on("featured", card("n1")), on("category:bakery", card("b"), "Bakery")]).svc.home();
    expect(home.rails.map((r) => r.key)).toEqual(["featured", "category:bakery"]);
  });

  it("a rail never offers a product that cannot be bought, and a rail left empty is dropped", async () => {
    const home = await build([
      on("featured", card("in")),
      on("featured", card("out", false)),
      on("on_sale", card("gone", false)),
    ]).svc.home();
    expect(home.rails[0]?.products.map((p) => p.id)).toEqual(["in"]);
    expect(home.rails.map((r) => r.key)).not.toContain("on_sale");
  });

  it("nothing to show is { rails: [] }", async () => {
    const home = await build([]).svc.home();
    expect(home).toEqual({ rails: [] });
  });
});
