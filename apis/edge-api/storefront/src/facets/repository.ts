// Every count reuses the search's `filters` builder, with the target facet's own selection cleared so ticking
// one value still shows the others. Group by omits zero counts by construction.
//
// Attribute facets (101): the filterable, customer-visible attributes the leaves in view ask for and some
// product in view has a value of — counted by ONE grouped statement for all of them, plus one per attribute
// the shopper has selected (its own selection cleared). A value of an attribute the product's leaf hides, or
// of an inactive variant, does not count.
import { pooled, type Queryable } from "@effy/edge-shared";
import type { InputType, UnitFamily } from "@effy/shared-types";

import { binder, filters, type SearchParams } from "../search/filters";

export interface OptionCountRow {
  value: string;
  label: string;
  n: number;
}

/** One value of one choice or yes/no attribute; `value` null is the attribute's own row (its coverage). */
export interface AttributeCountRow {
  key: string;
  name: string;
  input_type: InputType;
  value: string | null;
  label: string | null;
  n: number;
  /** The attribute's place in the forms of the leaves in view (lowest wins). */
  position: number;
}

export interface RangeRow {
  key: string;
  name: string;
  unit_family: UnitFamily | null;
  unit: string | null;
  lo: string;
  hi: string;
  n: number;
  position: number;
}

export interface FacetRepository {
  brandCounts(p: SearchParams): Promise<OptionCountRow[]>;
  /** The children of the selected category (its siblings when it is a leaf; departments when none). */
  categoryCounts(p: SearchParams): Promise<OptionCountRow[]>;
  /** `onlyKey` restricts the count to one attribute (a selected one, re-counted with its selection cleared). */
  attributeCounts(p: SearchParams, onlyKey?: string): Promise<AttributeCountRow[]>;
  rangeBounds(p: SearchParams, onlyKey?: string): Promise<RangeRow[]>;
  priceBounds(p: SearchParams): Promise<{ lo: string | null; hi: string | null }>;
}

/** The products in view and their home leaves, under `filters`. */
const inView = (p: SearchParams, next: ReturnType<typeof binder>) =>
  `SELECT p.id, p.primary_category_id FROM public.product p${filters(p, next)}`;

export function createFacetRepository(db: Queryable = pooled): FacetRepository {
  return {
    async brandCounts(p) {
      const args: unknown[] = [];
      const sql =
        "SELECT p.brand AS value, p.brand AS label, count(*)::int AS n\nFROM public.product p" +
        filters(p, binder(args)) +
        "\n  AND p.brand IS NOT NULL AND p.brand <> ''" +
        "\nGROUP BY p.brand\nORDER BY count(*) DESC, p.brand ASC";
      return (await db.query<OptionCountRow>(sql, args)).rows;
    },

    async categoryCounts(p) {
      const args: unknown[] = [];
      const next = binder(args);
      // The selection is cleared for the products in view, kept to choose which level to list.
      const selected = p.categoryKey === "" ? null : next(p.categoryKey);
      const level = selected === null
        ? "c.parent_id IS NULL"
        : `c.parent_id IS NOT DISTINCT FROM (
             SELECT CASE WHEN sr.is_leaf THEN sc.parent_id ELSE sc.id END
               FROM public.category sc JOIN public.category_resolved sr ON sr.category_id = sc.id
              WHERE sc.key = ${selected})`;
      const sql = `
WITH iv AS (${inView({ ...p, categoryKey: "" }, next)}),
membership AS (
    SELECT iv.id AS product_id, iv.primary_category_id AS category_id FROM iv
    UNION
    SELECT pp.product_id, pp.category_id FROM public.product_placement pp JOIN iv ON iv.id = pp.product_id
)
SELECT c.key AS value, c.name AS label, count(DISTINCT m.product_id)::int AS n
FROM public.category c
-- availability-exempt: public.category — category_resolved holds active categories only.
JOIN public.category_resolved r ON r.category_id = c.id
JOIN public.category_ancestor a ON a.ancestor_id = c.id
JOIN membership m ON m.category_id = a.category_id
WHERE ${level}
GROUP BY c.key, c.name, c."position"
ORDER BY c."position" ASC, c.name ASC`;
      return (await db.query<OptionCountRow>(sql, args)).rows;
    },

    async attributeCounts(p, onlyKey) {
      const args: unknown[] = [];
      const next = binder(args);
      const only = onlyKey === undefined ? "" : `\n  AND ad.key = ${next(onlyKey)}`;
      const sql = `
WITH iv AS (${inView(p, next)}),
vals AS (
    SELECT iv.id AS product_id, ad.key, ad.name, ad.input_type, cf."position",
           COALESCE(av.id::text, pav.value_boolean::text) AS value,
           COALESCE(av.label, CASE pav.value_boolean WHEN true THEN 'Yes' WHEN false THEN 'No' END) AS label,
           av."position" AS value_position
    FROM iv
    JOIN public.product_attribute_value pav ON pav.product_id = iv.id
    -- availability-exempt: public.attribute_definition — internal-only and unfilterable attributes are no facet.
    JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
     AND ad.filterable AND ad.customer_visible AND ad.status = 'active'
     AND ad.input_type IN ('single_select', 'multi_select', 'boolean')
    JOIN public.category_form cf ON cf.category_id = iv.primary_category_id AND cf.attribute_id = ad.id
    LEFT JOIN public.product_variant fv ON fv.id = pav.variant_id
    LEFT JOIN LATERAL unnest(pav.allowed_value_ids) AS u(vid) ON true
    LEFT JOIN public.attribute_allowed_value av ON av.id = u.vid
    WHERE (pav.variant_id IS NULL OR fv.state = 'active')${only}
)
SELECT key, name, input_type, value, label, count(DISTINCT product_id)::int AS n, min("position")::int AS "position"
FROM vals
WHERE value IS NOT NULL
GROUP BY GROUPING SETS ((key, name, input_type, value, label, value_position), (key, name, input_type))
ORDER BY key, min(value_position) NULLS FIRST, label`;
      return (await db.query<AttributeCountRow>(sql, args)).rows;
    },

    async rangeBounds(p, onlyKey) {
      const args: unknown[] = [];
      const next = binder(args);
      const only = onlyKey === undefined ? "" : `\n  AND ad.key = ${next(onlyKey)}`;
      const sql = `
WITH iv AS (${inView(p, next)})
SELECT ad.key, ad.name, ad.unit_family, ad.units[1] AS unit,
       min(pav.value_base)::text AS lo, max(pav.value_base)::text AS hi,
       count(DISTINCT iv.id)::int AS n, min(cf."position")::int AS "position"
FROM iv
JOIN public.product_attribute_value pav ON pav.product_id = iv.id
-- availability-exempt: public.attribute_definition — internal-only and unfilterable attributes are no facet.
JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
 AND ad.filterable AND ad.customer_visible AND ad.status = 'active' AND ad.input_type = 'number'
JOIN public.category_form cf ON cf.category_id = iv.primary_category_id AND cf.attribute_id = ad.id
LEFT JOIN public.product_variant fv ON fv.id = pav.variant_id
WHERE (pav.variant_id IS NULL OR fv.state = 'active') AND pav.value_base IS NOT NULL${only}
GROUP BY ad.key, ad.name, ad.unit_family, ad.units[1]`;
      return (await db.query<RangeRow>(sql, args)).rows;
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
