import type { ProductSort } from "@effy/shared-types";

import { categorySubtreeByKey } from "../lib/category-tree";
import type { Cursor } from "./cursor";

/** Cursor already decoded, limit already +1 for lookahead. */
export interface SearchParams {
  q: string;
  categoryKey: string;
  minPrice: string;
  maxPrice: string;
  saleOnly: boolean;
  /** OR within; empty means any brand. */
  brands: readonly string[];
  /** attribute key → value(s). OR within a key, and across keys. */
  attributes: Readonly<Record<string, readonly string[]>>;
  sort: ProductSort;
  /** Null for the first page; its sort is already checked. */
  cursor: Cursor | null;
  limit: number;
}

/** Must stay character-identical to the GIN trigram index expression; `trigram-index.guard.test.ts` compares. */
export const TRIGRAM_EXPR = `lower(p.name || ' ' || coalesce(p.brand, '') || ' ' || p.short_description)`;

/** A query that is a variant's stock code or barcode finds its product, exactly. `q` is bound once. */
export function codeMatchSql(q: string): string {
  return `EXISTS (SELECT 1 FROM public.product_variant cv
                  -- availability-exempt: product_variant — a visibility filter; a hidden variant is not findable.
                  WHERE cv.product_id = p.id AND cv.state = 'active'
                    AND (lower(cv.sku) = lower(${q}) OR cv.gtin = ${q} OR cv.code = upper(${q})))`;
}

/** The variant whose code `q` is, or null; the tile opens on it. */
export function matchedVariantSql(q: string): string {
  return `(SELECT mv.id::text FROM public.product_variant mv
            -- availability-exempt: product_variant — a visibility filter.
            WHERE mv.product_id = p.id AND mv.state = 'active'
              AND (lower(mv.sku) = lower(${q}) OR mv.gtin = ${q} OR mv.code = upper(${q}))
            ORDER BY mv.position LIMIT 1)`;
}

export type Binder = (value: unknown) => string;

export function binder(args: unknown[]): Binder {
  return (value) => {
    args.push(value);
    return `$${args.length}`;
  };
}

/** `id` is in every order by: no sort key is unique, and a keyset needs a unique tiebreak. */
export function orderClause(sort: ProductSort): string {
  switch (sort) {
    case "price_asc":
      return "\nORDER BY p.list_price_amount ASC, p.id ASC";
    case "price_desc":
      return "\nORDER BY p.list_price_amount DESC, p.id DESC";
    case "relevance":
      return "\nORDER BY score DESC, p.id DESC";
    default:
      return "\nORDER BY p.created_at DESC, p.id DESC";
  }
}

/** Mirrors the order by; a row-value comparison lets Postgres drive an index. */
export function cursorPredicate(p: SearchParams & { cursor: Cursor }, next: Binder): string {
  const cur = p.cursor;
  switch (p.sort) {
    case "price_asc":
      return `\n  AND (p.list_price_amount, p.id) > (${next(cur.key)}::numeric, ${next(cur.id)}::uuid)`;
    case "price_desc":
      return `\n  AND (p.list_price_amount, p.id) < (${next(cur.key)}::numeric, ${next(cur.id)}::uuid)`;
    case "relevance":
      // Where cannot reference the `score` alias, so the expression is repeated from the same constant.
      return `\n  AND (similarity(${TRIGRAM_EXPR}, ${next(p.q)}), p.id) < (${next(cur.key)}::real, ${next(cur.id)}::uuid)`;
    default:
      return `\n  AND (p.created_at, p.id) < (${next(cur.key)}::timestamptz, ${next(cur.id)}::uuid)`;
  }
}

/** Shared by the page, the count and every facet count, so the total always matches the list. */
export function filters(p: SearchParams, next: Binder): string {
  // availability-exempt: public.product — a listing filter (see lib/cards.ts).
  let sql = "\nWHERE p.status = 'active'";

  if (p.q !== "") {
    const q = next(`%${p.q}%`);
    sql += `\n  AND (p.name ILIKE ${q} OR p.brand ILIKE ${q} OR p.short_description ILIKE ${q} OR ${codeMatchSql(next(p.q.trim()))})`;
  }
  if (p.categoryKey !== "") {
    sql += `\n  AND p.primary_category_id IN ${categorySubtreeByKey(next(p.categoryKey))}`;
  }
  if (p.minPrice !== "") sql += `\n  AND p.list_price_amount >= ${next(p.minPrice)}::numeric`;
  if (p.maxPrice !== "") sql += `\n  AND p.list_price_amount <= ${next(p.maxPrice)}::numeric`;
  if (p.saleOnly) sql += "\n  AND p.list_compare_at_amount IS NOT NULL AND p.list_compare_at_amount > p.list_price_amount";
  if (p.brands.length > 0) sql += `\n  AND p.brand = ANY(${next([...p.brands])}::text[])`;

  for (const [key, vals] of Object.entries(p.attributes)) {
    if (vals.length === 0) continue;
    const kp = next(key);
    const vp = `${next([...vals])}::text[]`;
    // value_text: single_select; value_options: multi_select; value_boolean::text: boolean.
    sql += `
  AND EXISTS (
      SELECT 1 FROM public.product_attribute_value pav
      JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
      WHERE pav.product_id = p.id AND ad.key = ${kp}
        AND (pav.value_text = ANY(${vp}) OR pav.value_options && ${vp} OR pav.value_boolean::text = ANY(${vp})))`;
  }
  return sql;
}
