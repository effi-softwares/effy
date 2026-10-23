// Every count reuses the search's `filters` builder, with the target facet's own selection cleared
// so ticking one brand still shows the others. Group by omits zero counts by construction.
import { pooled, type Queryable } from "@effy/edge-shared";

import { binder, filters, type SearchParams } from "../search/filters";

export interface AttrDefRow {
  key: string;
  name: string;
  data_type: string;
}

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
    /** The bounded, option-backed types. */
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

    async brandCounts(p) {
      const args: unknown[] = [];
      const sql =
        "SELECT p.brand AS value, p.brand AS label, count(*)::int AS n\nFROM public.product p" +
        filters(p, binder(args)) +
        "\n  AND p.brand IS NOT NULL AND p.brand <> ''" +
        "\nGROUP BY p.brand\nORDER BY count(*) DESC, p.brand ASC";
      return (await db.query<OptionCountRow>(sql, args)).rows;
    },

    /** By primary category, own selection cleared so siblings stay visible. */
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

    /** count(distinct p.id), because a multi_select product unnests to several rows. */
    async attributeCounts(p, def) {
      const args: unknown[] = [];
      const next = binder(args);

      let valueExpr = "pav.value_text";
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
      // Group by the expression, not the `value` alias: it also appears nested in the SELECT (42803).
      sql += `\n  AND ${valueExpr} IS NOT NULL\nGROUP BY ${valueExpr}, aav.label\nORDER BY count(DISTINCT p.id) DESC, ${valueExpr} ASC`;
      return (await db.query<OptionCountRow>(sql, args)).rows;
    },

    /** Over the filtered set with its own bounds cleared; both null when empty. */
    async priceBounds(p) {
      const args: unknown[] = [];
      const sql =
        "SELECT min(p.list_price_amount)::text AS lo, max(p.list_price_amount)::text AS hi\nFROM public.product p" +
        filters(p, binder(args));
      const row = (await db.query<{ lo: string | null; hi: string | null }>(sql, args)).rows[0];
      return { lo: row?.lo ?? null, hi: row?.hi ?? null };
    },
  };
}
