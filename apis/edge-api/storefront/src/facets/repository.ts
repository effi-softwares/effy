// Facet counting (043). Every count query reuses the SAME `filters()` builder the search page and
// total use, so the counts describe exactly the set the grid will show. The service passes a copy
// of the params with the target facet's own selection cleared (own-selection exclusion), so ticking
// one brand still shows the other brands' counts (FR-008/FR-010). GROUP BY only yields values that
// are present, so zero-count omission (FR-009) is a property of the query, not a filter step.
import { pooled, type Queryable } from "@effy/edge-shared";

import { binder, filters, type SearchParams } from "../search/filters";

/** A facetable attribute definition (single/multi-select or boolean, active). */
export interface AttrDefRow {
  key: string;
  name: string;
  data_type: string;
}

/** One facet option with its count in the current set. */
export interface OptionCountRow {
  value: string;
  label: string;
  n: number;
}

export interface FacetRepository {
  facetableAttributeDefs(): Promise<AttrDefRow[]>;
  brandCounts(p: SearchParams): Promise<OptionCountRow[]>;
  categoryCounts(p: SearchParams): Promise<OptionCountRow[]>;
  attributeCounts(p: SearchParams, def: AttrDefRow): Promise<OptionCountRow[]>;
  priceBounds(p: SearchParams): Promise<{ lo: string | null; hi: string | null }>;
}

export function createFacetRepository(db: Queryable = pooled): FacetRepository {
  return {
    /** The active attributes that become characteristic facets: the bounded, option-backed types. */
    async facetableAttributeDefs() {
      return (
        await db.query<AttrDefRow>(`
SELECT key, name, data_type
FROM public.attribute_definition
-- availability-exempt: public.attribute_definition — a facet definition, not merchandise.
WHERE status = 'active'
  AND data_type IN ('single_select', 'multi_select', 'boolean')
ORDER BY name ASC`)
      ).rows;
    },

    /** Group the filtered set by brand (brand's own selection already cleared by the caller). */
    async brandCounts(p) {
      const args: unknown[] = [];
      const sql =
        "SELECT p.brand AS value, p.brand AS label, count(*)::int AS n\nFROM public.product p" +
        filters(p, binder(args)) +
        "\n  AND p.brand IS NOT NULL AND p.brand <> ''" +
        "\nGROUP BY p.brand\nORDER BY count(*) DESC, p.brand ASC";
      return (await db.query<OptionCountRow>(sql, args)).rows;
    },

    /** Group by primary category (category's own selection cleared), so siblings stay visible. */
    async categoryCounts(p) {
      const args: unknown[] = [];
      const sql =
        "SELECT c.key AS value, c.name AS label, count(p.id)::int AS n\nFROM public.product p" +
        // availability-exempt: public.category — the category filter's own lifecycle.
        "\nJOIN public.category c ON c.id = p.primary_category_id AND c.status = 'active'" +
        filters(p, binder(args)) +
        "\nGROUP BY c.key, c.name\nORDER BY count(p.id) DESC, c.name ASC";
      return (await db.query<OptionCountRow>(sql, args)).rows;
    },

    /**
     * Group by one attribute's values (that attribute's own selection cleared). The value
     * expression depends on the data type; the label prefers the authored allowed-value label.
     * count(DISTINCT p.id) is correct for multi_select, where one product unnests to several rows.
     */
    async attributeCounts(p, def) {
      const args: unknown[] = [];
      const next = binder(args);

      let valueExpr = "pav.value_text"; // single_select
      let extraFrom = "";
      if (def.data_type === "multi_select") {
        valueExpr = "v";
        extraFrom = "\nCROSS JOIN LATERAL unnest(pav.value_options) AS v";
      } else if (def.data_type === "boolean") {
        valueExpr = "pav.value_boolean::text";
      }

      const kp = next(def.key);
      let sql = `SELECT ${valueExpr} AS value, coalesce(aav.label, ${valueExpr}) AS label, count(DISTINCT p.id)::int AS n
FROM public.product p
JOIN public.product_attribute_value pav ON pav.product_id = p.id
JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id AND ad.key = ${kp}${extraFrom}
LEFT JOIN public.attribute_allowed_value aav ON aav.attribute_definition_id = ad.id AND aav.value = ${valueExpr}`;
      sql += filters(p, next);
      // ⚠ GROUP BY / ORDER BY the value EXPRESSION, never the `value` alias. `value` also appears
      // inside coalesce(aav.label, <expr>) in the SELECT, and Postgres does not treat an output
      // alias in GROUP BY as covering that nested occurrence — it raises 42803. That bug shipped
      // once because the facet tests faked the repository and the SQL never met a real Postgres.
      sql += `\n  AND ${valueExpr} IS NOT NULL\nGROUP BY ${valueExpr}, aav.label\nORDER BY count(DISTINCT p.id) DESC, ${valueExpr} ASC`;
      return (await db.query<OptionCountRow>(sql, args)).rows;
    },

    /** Min/max price over the filtered set (price's own bounds cleared). Both null when empty. */
    async priceBounds(p) {
      const args: unknown[] = [];
      const sql =
        "SELECT min(p.price_amount)::text AS lo, max(p.price_amount)::text AS hi\nFROM public.product p" +
        filters(p, binder(args));
      const row = (await db.query<{ lo: string | null; hi: string | null }>(sql, args)).rows[0];
      return { lo: row?.lo ?? null, hi: row?.hi ?? null };
    },
  };
}
