import type { ProductSort } from "@effy/shared-types";

import { categoryMembershipByKeySql } from "@effy/edge-shared/catalog";
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
  /** attribute key → value(s): allowed-value ids, or "true"/"false" for yes/no. OR within a key, AND across keys. */
  attributes: Readonly<Record<string, readonly string[]>>;
  /** number attribute key → bounds in the attribute's base unit (`toBase`); null = open. AND with everything. */
  ranges: Readonly<Record<string, AttributeRange>>;
  sort: ProductSort;
  /** Null for the first page; its sort is already checked. */
  cursor: Cursor | null;
  limit: number;
}

export interface AttributeRange {
  min: number | null;
  max: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A product value of attribute `key` (a bind placeholder) that counts for filters: a customer-visible,
 * filterable attribute the product's leaf asks for (a hidden one does not count), held by the product or by
 * one of its ACTIVE variants. `extra` narrows the value; `variant` (an SQL expression) restricts per-variant
 * values to that variant.
 */
function attributeValueExists(p: string, key: string, extra: string, variant?: string): string {
  return `EXISTS (
      SELECT 1 FROM public.product_attribute_value fpav
      JOIN public.attribute_definition fad ON fad.id = fpav.attribute_definition_id
       AND fad.key = ${key} AND fad.filterable AND fad.customer_visible
      JOIN public.category_form fcf ON fcf.category_id = ${p}.primary_category_id AND fcf.attribute_id = fad.id
      LEFT JOIN public.product_variant fpv ON fpv.id = fpav.variant_id
      WHERE fpav.product_id = ${p}.id
        -- availability-exempt: product_variant — which values count for a filter, not whether it can be bought.
        AND (fpav.variant_id IS NULL OR ${variant ? `fpav.variant_id = ${variant}` : "fpv.state = 'active'"})
        AND ${extra})`;
}

/** The attribute conditions alone, over product alias `p` (and, for one variant, `variant`). */
function attributeConditions(p: SearchParams, next: Binder, alias = "p", variant?: string): string[] {
  const conds: string[] = [];
  for (const [key, vals] of Object.entries(p.attributes)) {
    if (vals.length === 0) continue;
    const ids = vals.filter((v) => UUID.test(v));
    const bools = vals.filter((v) => v === "true" || v === "false");
    const keyParam = next(key);
    conds.push(attributeValueExists(alias, keyParam,
      `(fpav.allowed_value_ids && ${next(ids)}::uuid[] OR fpav.value_boolean::text = ANY(${next(bools)}::text[]))`, variant));
  }
  for (const [key, r] of Object.entries(p.ranges)) {
    if (r.min === null && r.max === null) continue;
    const keyParam = next(key);
    const bounds = [
      r.min !== null ? `fpav.value_base >= ${next(r.min)}::numeric` : null,
      r.max !== null ? `fpav.value_base <= ${next(r.max)}::numeric` : null,
    ].filter(Boolean).join(" AND ");
    conds.push(attributeValueExists(alias, keyParam, bounds, variant));
  }
  return conds;
}

/**
 * The tile's variant when attribute filters are set: the first active variant (by position) for which every
 * condition holds — the one a "no milk" shopper should see first. Null without attribute filters.
 */
export function matchedFilterVariantSql(p: SearchParams, next: Binder): string | null {
  const conds = attributeConditions(p, next, "p", "mfv.id");
  if (conds.length === 0) return null;
  return `(SELECT mfv.id::text FROM public.product_variant mfv
            -- availability-exempt: product_variant — a visibility filter; a hidden variant is never the tile's.
            WHERE mfv.product_id = p.id AND mfv.state = 'active' AND ${conds.join("\n              AND ")}
            ORDER BY mfv.position LIMIT 1)`;
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
    sql += `\n  AND ${categoryMembershipByKeySql("p", next(p.categoryKey))}`;
  }
  if (p.minPrice !== "") sql += `\n  AND p.list_price_amount >= ${next(p.minPrice)}::numeric`;
  if (p.maxPrice !== "") sql += `\n  AND p.list_price_amount <= ${next(p.maxPrice)}::numeric`;
  if (p.saleOnly) sql += "\n  AND p.list_compare_at_amount IS NOT NULL AND p.list_compare_at_amount > p.list_price_amount";
  if (p.brands.length > 0) sql += `\n  AND p.brand = ANY(${next([...p.brands])}::text[])`;

  for (const cond of attributeConditions(p, next)) sql += `\n  AND ${cond}`;
  return sql;
}
