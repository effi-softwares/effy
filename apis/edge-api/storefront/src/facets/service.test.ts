import { describe, expect, it } from "vitest";

import type { SearchParams } from "../search/filters";
import type { AttrDefRow, FacetRepository, OptionCountRow } from "./repository";
import { createFacetService, type FacetQuery } from "./service";

const q = (over: Partial<FacetQuery> = {}): FacetQuery => ({
  q: "", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {}, ...over,
});

function fake(opts: {
  defs?: AttrDefRow[];
  category?: OptionCountRow[];
  brand?: OptionCountRow[];
  attrs?: Record<string, OptionCountRow[]>;
  bounds?: { lo: string | null; hi: string | null };
}) {
  const seen: Record<string, SearchParams> = {};
  const repo: FacetRepository = {
    facetableAttributeDefs: async () => opts.defs ?? [],
    categoryCounts: async (p) => ((seen.category = p), opts.category ?? []),
    brandCounts: async (p) => ((seen.brand = p), opts.brand ?? []),
    priceBounds: async (p) => ((seen.price = p), opts.bounds ?? { lo: null, hi: null }),
    attributeCounts: async (p, def) => ((seen[`attr:${def.key}`] = p), opts.attrs?.[def.key] ?? []),
  };
  return { svc: createFacetService(repo), seen };
}

const opt = (value: string, n: number, label = value): OptionCountRow => ({ value, label, n });

describe("facets", () => {
  it("counts each facet with its OWN selection cleared and every other filter kept", async () => {
    const { svc, seen } = fake({ defs: [{ key: "dietary", name: "Dietary", data_type: "multi_select" }] });
    await svc.facets(q({
      q: "milk", categoryKey: "dairy", minPrice: "1", maxPrice: "9", saleOnly: true,
      brands: ["A"], attributes: { dietary: ["vegan"], organic: ["true"] },
    }));

    expect(seen.category).toMatchObject({ categoryKey: "", brands: ["A"], minPrice: "1", q: "milk", saleOnly: true });
    expect(seen.brand).toMatchObject({ brands: [], categoryKey: "dairy" });
    expect(seen.price).toMatchObject({ minPrice: "", maxPrice: "", brands: ["A"], categoryKey: "dairy" });
    expect(seen["attr:dietary"]?.attributes).toEqual({ organic: ["true"] }); // its own key gone, the other kept
    expect(seen["attr:dietary"]).toMatchObject({ brands: ["A"], categoryKey: "dairy" });
  });

  it("orders category, then brand, then attributes as the repository named them", async () => {
    const { svc } = fake({
      defs: [
        { key: "dietary", name: "Dietary", data_type: "multi_select" },
        { key: "organic", name: "Organic", data_type: "boolean" },
      ],
      category: [opt("dairy", 3, "Dairy")],
      brand: [opt("Oatly", 2)],
      attrs: { dietary: [opt("vegan", 2, "Vegan")], organic: [opt("true", 1)] },
    });
    const { facets } = await svc.facets(q());
    expect(facets.map((f) => [f.key, f.type])).toEqual([
      ["category", "single_select"], ["brand", "multi_select"], ["dietary", "multi_select"], ["organic", "multi_select"],
    ]);
  });

  it("labels booleans Yes/No and keeps authored labels for everything else", async () => {
    const { svc } = fake({
      defs: [{ key: "organic", name: "Organic", data_type: "boolean" }, { key: "size", name: "Size", data_type: "single_select" }],
      attrs: { organic: [opt("true", 2, "true"), opt("false", 1, "false")], size: [opt("lg", 1, "Large")] },
    });
    const { facets } = await svc.facets(q());
    expect(facets[0]?.options).toEqual([{ value: "true", label: "Yes", count: 2 }, { value: "false", label: "No", count: 1 }]);
    expect(facets[1]?.options).toEqual([{ value: "lg", label: "Large", count: 1 }]);
  });

  it("omits a zero-count option and a facet left with none", async () => {
    const { svc } = fake({
      defs: [{ key: "dietary", name: "Dietary", data_type: "multi_select" }],
      category: [opt("dairy", 0)],
      brand: [opt("A", 2), opt("B", 0)],
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
