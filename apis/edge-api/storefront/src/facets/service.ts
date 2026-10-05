// Facet composition (043): counts per option, each facet counted with its OWN selection cleared.
import type { FacetDTO, FacetOptionDTO, FacetSetDTO } from "@effy/shared-types";

import type { SearchParams } from "../search/filters";
import type { SearchQuery } from "../search/service";
import type { FacetRepository, OptionCountRow } from "./repository";

export type FacetQuery = Omit<SearchQuery, "sort" | "cursor" | "limit">;

const clearBrands = (p: SearchParams): SearchParams => ({ ...p, brands: [] });
const clearCategory = (p: SearchParams): SearchParams => ({ ...p, categoryKey: "" });
const clearPrice = (p: SearchParams): SearchParams => ({ ...p, minPrice: "", maxPrice: "" });
const clearAttr = (p: SearchParams, key: string): SearchParams => ({
  ...p,
  attributes: Object.fromEntries(Object.entries(p.attributes).filter(([k]) => k !== key)),
});

/** Booleans are stored as 'true'/'false'; a shopper reads Yes/No. */
function boolLabeler(dataType: string): ((v: string) => string) | null {
  if (dataType !== "boolean") return null;
  return (v) => (v === "true" ? "Yes" : v === "false" ? "No" : v);
}

function toOptions(rows: readonly OptionCountRow[], relabel: ((v: string) => string) | null): FacetOptionDTO[] {
  return rows
    .filter((r) => r.n > 0)
    .map((r) => ({ value: r.value, label: relabel ? relabel(r.value) : r.label, count: r.n }));
}

export function createFacetService(repo: FacetRepository) {
  return {
    /**
     * The facet set for the current query. Order is fixed — category, brand, then attributes by
     * name — and a facet with no options is omitted, so the panel never shows an empty heading.
     */
    async facets(q: FacetQuery): Promise<FacetSetDTO> {
      const base: SearchParams = {
        q: q.q, categoryKey: q.categoryKey, minPrice: q.minPrice, maxPrice: q.maxPrice,
        saleOnly: q.saleOnly, brands: q.brands, attributes: q.attributes,
        sort: "newest", cursor: null, limit: 0, // unused by the count queries
      };

      const defs = await repo.facetableAttributeDefs();

      const [categoryOpts, brandOpts, bounds, ...attrOpts] = await Promise.all([
        repo.categoryCounts(clearCategory(base)),
        repo.brandCounts(clearBrands(base)),
        repo.priceBounds(clearPrice(base)),
        ...defs.map((def) => repo.attributeCounts(clearAttr(base, def.key), def)),
      ]);

      const facets: FacetDTO[] = [];
      const category = toOptions(categoryOpts, null);
      if (category.length > 0) facets.push({ key: "category", label: "Category", type: "single_select", options: category });
      const brand = toOptions(brandOpts, null);
      if (brand.length > 0) facets.push({ key: "brand", label: "Brand", type: "multi_select", options: brand });
      defs.forEach((def, i) => {
        const options = toOptions(attrOpts[i] ?? [], boolLabeler(def.data_type));
        if (options.length > 0) facets.push({ key: def.key, label: def.name, type: "multi_select", options });
      });

      return {
        priceBounds: bounds.lo !== null && bounds.hi !== null ? { min: bounds.lo, max: bounds.hi } : null,
        facets,
      };
    },
  };
}

export type FacetService = ReturnType<typeof createFacetService>;
