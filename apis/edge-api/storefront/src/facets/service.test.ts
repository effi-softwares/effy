import { describe, expect, it } from "vitest";

import type { SearchParams } from "../search/filters";
import type { AttributeCountRow, FacetRepository, OptionCountRow, RangeRow } from "./repository";
import { createFacetService, SEARCH_ATTRIBUTE_FACETS_MAX, type FacetQuery } from "./service";

const q = (over: Partial<FacetQuery> = {}): FacetQuery => ({
  q: "", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {}, ranges: {}, ...over,
});

function fake(opts: {
  category?: OptionCountRow[];
  brand?: OptionCountRow[];
  attrs?: AttributeCountRow[];
  /** Re-counts of a selected attribute, by key. */
  reAttrs?: Record<string, AttributeCountRow[]>;
  ranges?: RangeRow[];
  bounds?: { lo: string | null; hi: string | null };
}) {
  const seen: Record<string, SearchParams> = {};
  const repo: FacetRepository = {
    categoryCounts: async (p) => ((seen.category = p), opts.category ?? []),
    brandCounts: async (p) => ((seen.brand = p), opts.brand ?? []),
    priceBounds: async (p) => ((seen.price = p), opts.bounds ?? { lo: null, hi: null }),
    attributeCounts: async (p, only) => ((seen[only ? `attr:${only}` : "attrs"] = p), only ? (opts.reAttrs?.[only] ?? []) : (opts.attrs ?? [])),
    rangeBounds: async (p, only) => ((seen[only ? `range:${only}` : "ranges"] = p), opts.ranges?.filter((r) => !only || r.key === only) ?? []),
  };
  const units = async (keys: readonly string[]) => new Map(keys.map((k) => [k, { unitFamily: "mass" as const, unit: "kg" }]));
  return { svc: createFacetService(repo, units), seen };
}

const opt = (value: string, n: number, label = value): OptionCountRow => ({ value, label, n });
const attr = (key: string, value: string | null, n: number, over: Partial<AttributeCountRow> = {}): AttributeCountRow => ({
  key, name: key[0]!.toUpperCase() + key.slice(1), input_type: "multi_select", value, label: value, n, position: 10, ...over,
});

describe("facets (101)", () => {
  it("counts each facet with its OWN selection cleared and every other filter kept", async () => {
    const { svc, seen } = fake({});
    await svc.facets(q({
      q: "milk", categoryKey: "dairy", minPrice: "1", maxPrice: "9", saleOnly: true,
      brands: ["A"], attributes: { dietary: ["vegan"], organic: ["true"] }, ranges: { weight: { min: "1", max: "" } },
    }));

    expect(seen.category).toMatchObject({ categoryKey: "", brands: ["A"], minPrice: "1", q: "milk", saleOnly: true });
    expect(seen.brand).toMatchObject({ brands: [], categoryKey: "dairy" });
    expect(seen.price).toMatchObject({ minPrice: "", maxPrice: "", brands: ["A"], categoryKey: "dairy" });
    expect(seen["attr:dietary"]?.attributes).toEqual({ organic: ["true"] }); // its own key gone, the other kept
    expect(seen["attr:dietary"]?.ranges).toEqual({ weight: { min: 1000, max: null } }); // in base units
    expect(seen["range:weight"]?.ranges).toEqual({});
    expect(seen.attrs?.attributes).toEqual({ dietary: ["vegan"], organic: ["true"] });
  });

  it("orders category, brand, then attributes by their place in the aisle's form", async () => {
    const { svc } = fake({
      category: [opt("milk", 3, "Milk")],
      brand: [opt("Oatly", 2)],
      attrs: [
        attr("dietary", null, 2, { position: 30 }), attr("dietary", "v", 2, { label: "Vegan", position: 30 }),
        attr("allergens", null, 1, { position: 10 }), attr("allergens", "m", 1, { label: "Milk", position: 10 }),
      ],
      ranges: [{ key: "weight", name: "Weight", unit_family: "mass", unit: "kg", lo: "250", hi: "1500", n: 2, position: 20 }],
    });
    const { facets } = await svc.facets(q({ categoryKey: "dairy" }));
    expect(facets.map((f) => [f.key, f.type])).toEqual([
      ["category", "single_select"], ["brand", "multi_select"], ["allergens", "multi_select"], ["weight", "range"], ["dietary", "multi_select"],
    ]);
    expect(facets[3]).toEqual({ key: "weight", label: "Weight", type: "range", options: [], range: { min: "0.25", max: "1.5", unit: "kg" } });
  });

  it("search keeps the attributes covering the most results, never dropping one in use", async () => {
    const many = Array.from({ length: SEARCH_ATTRIBUTE_FACETS_MAX + 3 }, (_, i) => `a${String(i).padStart(2, "0")}`);
    const attrs = many.flatMap((k, i) => [attr(k, null, 100 - i), attr(k, "x", 100 - i)]);
    const last = many[many.length - 1]!;
    const { svc } = fake({ attrs, reAttrs: { [last]: [attr(last, null, 1), attr(last, "x", 1)] } });
    const { facets } = await svc.facets(q({ attributes: { [last]: ["x"] } }));
    const keys = facets.map((f) => f.key);
    expect(keys.slice(0, SEARCH_ATTRIBUTE_FACETS_MAX)).toEqual(many.slice(0, SEARCH_ATTRIBUTE_FACETS_MAX));
    expect(keys).toContain(last);
    expect(keys).toHaveLength(SEARCH_ATTRIBUTE_FACETS_MAX + 1);
  });

  it("omits a zero-count option and a facet left with none", async () => {
    const { svc } = fake({
      category: [opt("dairy", 0)],
      brand: [opt("A", 2), opt("B", 0)],
      attrs: [attr("dietary", null, 0), attr("dietary", "v", 0)],
    });
    const { facets } = await svc.facets(q());
    expect(facets).toEqual([{ key: "brand", label: "Brand", type: "multi_select", options: [{ value: "A", label: "A", count: 2 }] }]);
  });

  it("price bounds need both ends; an empty set has none", async () => {
    expect((await fake({ bounds: { lo: "1.00", hi: "9.50" } }).svc.facets(q())).priceBounds).toEqual({ min: "1.00", max: "9.50" });
    expect((await fake({}).svc.facets(q())).priceBounds).toBeNull();
    expect((await fake({ bounds: { lo: "1.00", hi: null } }).svc.facets(q())).priceBounds).toBeNull();
  });

  it("an empty catalogue is { priceBounds: null, facets: [] } — never absent keys", async () => {
    expect(await fake({}).svc.facets(q())).toEqual({ priceBounds: null, facets: [] });
  });
});
