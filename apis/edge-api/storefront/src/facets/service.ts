import { fromBase, isUnitFamily, type FacetDTO, type FacetOptionDTO, type FacetSetDTO } from "@effy/shared-types";

import type { AttributeRange, SearchParams } from "../search/filters";
import { toBaseRanges, type RangeUnitLookup } from "../search/ranges";
import type { SearchQuery } from "../search/service";
import type { AttributeCountRow, FacetRepository, OptionCountRow, RangeRow } from "./repository";

export type FacetQuery = Omit<SearchQuery, "sort" | "cursor" | "limit">;

/** Search across the whole catalogue offers at most this many attribute facets, those covering the most results. */
export const SEARCH_ATTRIBUTE_FACETS_MAX = 8;

const clearBrands = (p: SearchParams): SearchParams => ({ ...p, brands: [] });
const clearCategory = (p: SearchParams): SearchParams => ({ ...p, categoryKey: "" });
const clearPrice = (p: SearchParams): SearchParams => ({ ...p, minPrice: "", maxPrice: "" });
const clearAttr = (p: SearchParams, key: string): SearchParams => ({
  ...p,
  attributes: Object.fromEntries(Object.entries(p.attributes).filter(([k]) => k !== key)),
});
const clearRange = (p: SearchParams, key: string): SearchParams => ({
  ...p,
  ranges: Object.fromEntries(Object.entries(p.ranges).filter(([k]) => k !== key)),
});

function toOptions(rows: readonly OptionCountRow[]): FacetOptionDTO[] {
  return rows.filter((r) => r.n > 0).map((r) => ({ value: r.value, label: r.label, count: r.n }));
}

interface AttributeFacet {
  facet: FacetDTO;
  coverage: number;
  position: number;
  selected: boolean;
}

/** The bounds in view, shown in the attribute's first unit, widened outward to two decimals. */
function rangeFacet(r: RangeRow): FacetDTO {
  const show = (base: number, round: (n: number) => number) => {
    const v = r.unit_family && isUnitFamily(r.unit_family) && r.unit ? fromBase(base, r.unit_family, r.unit) : base;
    return String(round(v * 100) / 100);
  };
  return {
    key: r.key,
    label: r.name,
    type: "range",
    options: [],
    range: { min: show(Number(r.lo), Math.floor), max: show(Number(r.hi), Math.ceil), unit: r.unit },
  };
}

function choiceFacets(rows: readonly AttributeCountRow[]): Map<string, { facet: FacetDTO; coverage: number; position: number }> {
  const out = new Map<string, { facet: FacetDTO; coverage: number; position: number }>();
  for (const r of rows) {
    const entry = out.get(r.key) ?? {
      facet: { key: r.key, label: r.name, type: "multi_select" as const, options: [] },
      coverage: 0,
      position: Number(r.position),
    };
    if (r.value === null) {
      entry.coverage = r.n;
      entry.position = Number(r.position);
    } else if (r.n > 0) {
      entry.facet.options.push({ value: r.value, label: r.label ?? r.value, count: r.n });
    }
    out.set(r.key, entry);
  }
  return out;
}

export function createFacetService(repo: FacetRepository, rangeUnits: RangeUnitLookup) {
  return {
    /** Category, brand, then attributes (form order on an aisle; most results first in search). */
    async facets(q: FacetQuery): Promise<FacetSetDTO> {
      const ranges: Record<string, AttributeRange> = await toBaseRanges(q.ranges, rangeUnits);
      const base: SearchParams = {
        q: q.q, categoryKey: q.categoryKey, minPrice: q.minPrice, maxPrice: q.maxPrice,
        saleOnly: q.saleOnly, brands: q.brands, attributes: q.attributes, ranges,
        sort: "newest", cursor: null, limit: 0,
      };
      const selectedAttrs = Object.entries(base.attributes).filter(([, v]) => v.length > 0).map(([k]) => k);
      const selectedRanges = Object.keys(base.ranges);

      const [categoryOpts, brandOpts, bounds, attrRows, rangeRows, reAttr, reRange] = await Promise.all([
        repo.categoryCounts(clearCategory(base)),
        repo.brandCounts(clearBrands(base)),
        repo.priceBounds(clearPrice(base)),
        repo.attributeCounts(base),
        repo.rangeBounds(base),
        Promise.all(selectedAttrs.map((k) => repo.attributeCounts(clearAttr(base, k), k))),
        Promise.all(selectedRanges.map((k) => repo.rangeBounds(clearRange(base, k), k))),
      ]);

      // A selected attribute is counted with its own selection cleared, so its other values stay offered.
      const choices = choiceFacets(attrRows.filter((r) => !selectedAttrs.includes(r.key)));
      for (const [k, v] of choiceFacets(reAttr.flat())) choices.set(k, v);
      const numbers = new Map(rangeRows.filter((r) => !selectedRanges.includes(r.key)).map((r) => [r.key, r]));
      for (const r of reRange.flat()) numbers.set(r.key, r);

      const attributes: AttributeFacet[] = [
        ...[...choices.values()]
          .filter((c) => c.facet.options.length > 0)
          .map((c) => ({ ...c, selected: selectedAttrs.includes(c.facet.key) })),
        ...[...numbers.values()].map((r) => ({
          facet: rangeFacet(r), coverage: r.n, position: Number(r.position), selected: selectedRanges.includes(r.key),
        })),
      ];
      const inAisle = q.categoryKey !== "";
      attributes.sort((a, b) =>
        inAisle
          ? a.position - b.position || b.coverage - a.coverage || a.facet.label.localeCompare(b.facet.label)
          : b.coverage - a.coverage || a.position - b.position || a.facet.label.localeCompare(b.facet.label),
      );
      // Search keeps the most useful few; a facet the shopper is using is never dropped.
      const shown = inAisle
        ? attributes
        : attributes.filter((a, i) => a.selected || i < SEARCH_ATTRIBUTE_FACETS_MAX);

      const facets: FacetDTO[] = [];
      const category = toOptions(categoryOpts);
      if (category.length > 0) facets.push({ key: "category", label: "Category", type: "single_select", options: category });
      const brand = toOptions(brandOpts);
      if (brand.length > 0) facets.push({ key: "brand", label: "Brand", type: "multi_select", options: brand });
      facets.push(...shown.map((a) => a.facet));

      return {
        priceBounds: bounds.lo !== null && bounds.hi !== null ? { min: bounds.lo, max: bounds.hi } : null,
        facets,
      };
    },
  };
}

export type FacetService = ReturnType<typeof createFacetService>;
