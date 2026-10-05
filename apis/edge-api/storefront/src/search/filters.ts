/**
 * The search query's moving parts: the shared WHERE, the ORDER BY per sort, and the keyset
 * predicate. Search / browse (019 US4, 025 US1, 043).
 */
import type { ProductSort } from "@effy/shared-types";

import type { Cursor } from "./cursor";

/** The repository-level query (cursor already decoded, limit already +1 for lookahead). */
export interface SearchParams {
  q: string;
  categoryKey: string;
  minPrice: string;
  maxPrice: string;
  saleOnly: boolean;
  /** Brands selected in the brand facet — OR within (043 FR-003). Empty means "any brand". */
  brands: readonly string[];
  /** attribute-definition key → selected value(s). OR within a key, AND across keys. */
  attributes: Readonly<Record<string, readonly string[]>>;
  sort: ProductSort;
  /** Null for the first page. Its sort has already been checked against `sort` by the service. */
  cursor: Cursor | null;
  limit: number;
}

/**
 * The text this search scores and matches against.
 *
 * ⚠ It MUST stay character-identical to the expression the GIN trigram index is built on
 * (db/migrations/20260716092105_product_catalog.sql). Postgres matches an expression index by the
 * expression, so a stray space or a reordered column here silently drops the index and turns every
 * relevance search into a sequential scan — with no error and no visible symptom until the
 * catalogue grows. `trigram-index.guard.test.ts` reads the migration and compares.
 */
export const TRIGRAM_EXPR = `lower(p.name || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.brand, '') || ' ' || p.short_description)`;

/** Mints `$n` placeholders over an argument list. */
export type Binder = (value: unknown) => string;

export function binder(args: unknown[]): Binder {
  return (value) => {
    args.push(value);
    return `$${args.length}`;
  };
}

/**
 * The ORDER BY for a sort. `id` is in every one because no sort key is unique — two products can
 * share a price, or a created_at to the microsecond — and a keyset without a unique tiebreak skips
 * and repeats rows at every page boundary.
 */
export function orderClause(sort: ProductSort): string {
  switch (sort) {
    case "price_asc":
      return "\nORDER BY p.price_amount ASC, p.id ASC";
    case "price_desc":
      return "\nORDER BY p.price_amount DESC, p.id DESC";
    case "relevance":
      return "\nORDER BY score DESC, p.id DESC";
    default:
      return "\nORDER BY p.created_at DESC, p.id DESC";
  }
}

/**
 * The keyset WHERE fragment for a sort. The comparison direction mirrors the ORDER BY exactly.
 * Row-value comparison is used rather than the expanded OR form because Postgres can drive an
 * index with it directly.
 */
export function cursorPredicate(p: SearchParams & { cursor: Cursor }, next: Binder): string {
  const cur = p.cursor;
  switch (p.sort) {
    case "price_asc":
      return `\n  AND (p.price_amount, p.id) > (${next(cur.key)}::numeric, ${next(cur.id)}::uuid)`;
    case "price_desc":
      return `\n  AND (p.price_amount, p.id) < (${next(cur.key)}::numeric, ${next(cur.id)}::uuid)`;
    case "relevance":
      // `score` is a select-list alias, and SQL will not let WHERE reference one — so the
      // expression is repeated. Both occurrences are built from the same TRIGRAM_EXPR constant and
      // the same bound query text, so they cannot drift apart.
      return `\n  AND (similarity(${TRIGRAM_EXPR}, ${next(p.q)}), p.id) < (${next(cur.key)}::real, ${next(cur.id)}::uuid)`;
    default:
      return `\n  AND (p.created_at, p.id) < (${next(cur.key)}::timestamptz, ${next(cur.id)}::uuid)`;
  }
}

/**
 * The WHERE shared by the page query, the count query and every facet count.
 *
 * ⚠ ONE builder, deliberately. If the count used its own copy of these predicates the two would
 * drift the first time a filter was added to one of them, and the shopper would see "48 results"
 * above a list of 31 — a number wrong in a way nobody can debug from the outside (025 FR-016a).
 */
export function filters(p: SearchParams, next: Binder): string {
  // availability-exempt: public.product — a LISTING filter (see lib/cards.ts). Search results keep
  // an out-of-stock product visible and mark it unavailable (054 FR-013, A10).
  let sql = "\nWHERE p.status = 'active'";

  if (p.q !== "") {
    const q = next(`%${p.q}%`);
    sql += `\n  AND (p.name ILIKE ${q} OR p.brand ILIKE ${q} OR p.short_description ILIKE ${q})`;
  }
  if (p.categoryKey !== "") {
    sql += `\n  AND p.primary_category_id = (SELECT id FROM public.category WHERE key = ${next(p.categoryKey)})`;
  }
  if (p.minPrice !== "") sql += `\n  AND p.price_amount >= ${next(p.minPrice)}::numeric`;
  if (p.maxPrice !== "") sql += `\n  AND p.price_amount <= ${next(p.maxPrice)}::numeric`;
  if (p.saleOnly) sql += "\n  AND p.compare_at_amount IS NOT NULL AND p.compare_at_amount > p.price_amount";
  if (p.brands.length > 0) sql += `\n  AND p.brand = ANY(${next([...p.brands])}::text[])`;

  for (const [key, vals] of Object.entries(p.attributes)) {
    if (vals.length === 0) continue;
    const kp = next(key);
    const vp = `${next([...vals])}::text[]`; // one text[] bind, reused three times below
    // value_text covers single_select; value_options (overlap) covers multi_select;
    // value_boolean::text covers boolean facets ('true'/'false'). One predicate, all three types.
    sql += `
  AND EXISTS (
      SELECT 1 FROM public.product_attribute_value pav
      JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
      WHERE pav.product_id = p.id AND ad.key = ${kp}
        AND (pav.value_text = ANY(${vp}) OR pav.value_options && ${vp} OR pav.value_boolean::text = ANY(${vp})))`;
  }
  return sql;
}
