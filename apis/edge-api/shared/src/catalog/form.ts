// The readers of the resolved taxonomy (101). Every service asks these, never the derived tables directly:
//  readFormRows / readForm   a category's resolved form (public.category_form, written only by
//                            public.rebuild_category_derived) with its attributes and values;
//  readResolved              a category's path, depth, leaf-ness and resolved fact defaults;
//  missingRequired           required details a product lacks (public.product_missing_required), with
//                            per-variant gaps named by the one label rule;
//  categoryMembershipSql     "this product is in that category": its home leaf or an extra placement, at
//                            or beneath it.

import type { CategoryFormDTO, CategoryFormRow, CategoryFormSection, FactDefaults, GstStatus, Storage } from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { variantLabelSql } from "./label";

export interface ReadFormOptions {
  /** Back-office: the category that set or last tightened each row. */
  withSources?: boolean;
  /** Include retired values (to read an existing product's values back); new choices offer active ones only. */
  includeRetiredValues?: boolean;
}

interface FormRowSql {
  category_id: string;
  attribute_id: string;
  key: string;
  name: string;
  help_text: string | null;
  input_type: CategoryFormRow["inputType"];
  unit_family: CategoryFormRow["unitFamily"];
  units: string[] | null;
  min_value: string | null;
  max_value: string | null;
  decimals: number | null;
  max_length: number | null;
  values: { id: string; label: string }[] | null;
  level: CategoryFormRow["level"];
  section: string;
  position: number;
  filterable: boolean;
  customer_visible: boolean;
  varies_by_variant: boolean;
  variant_option: boolean;
  source_id: string;
  source_name: string;
}

/** Each category's resolved form rows, in form order (section, position, name). */
export async function readFormRows(
  db: Queryable,
  categoryIds: readonly string[],
  opts: ReadFormOptions = {},
): Promise<Map<string, CategoryFormRow[]>> {
  const out = new Map<string, CategoryFormRow[]>();
  for (const id of categoryIds) out.set(id, []);
  if (categoryIds.length === 0) return out;
  const r = await db.query<FormRowSql>(
    `SELECT f.category_id::text, ad.id::text AS attribute_id, ad.key, ad.name, ad.help_text, ad.input_type, ad.unit_family,
            ad.units, ad.min_value::text, ad.max_value::text, ad.decimals, ad.max_length,
            (SELECT json_agg(json_build_object('id', v.id, 'label', v.label) ORDER BY v."position", v.label)
               FROM public.attribute_allowed_value v
              WHERE v.attribute_definition_id = ad.id AND ($2 OR v.status = 'active')) AS values,
            f.level, f.section, f."position", ad.filterable, ad.customer_visible, ad.varies_by_variant, ad.variant_option,
            f.source_category_id::text AS source_id, src.name AS source_name
       FROM public.category_form f
       JOIN public.attribute_definition ad ON ad.id = f.attribute_id
       JOIN public.category src ON src.id = f.source_category_id
      WHERE f.category_id = ANY($1::uuid[])
      ORDER BY f.category_id, f.section, f."position", ad.name`,
    [categoryIds, opts.includeRetiredValues === true],
  );
  for (const row of r.rows) {
    const mapped: CategoryFormRow = {
      attributeId: row.attribute_id,
      key: row.key,
      name: row.name,
      helpText: row.help_text,
      inputType: row.input_type,
      unitFamily: row.unit_family,
      units: row.units ?? [],
      min: row.min_value,
      max: row.max_value,
      decimals: row.decimals === null ? null : Number(row.decimals),
      maxLength: row.max_length === null ? null : Number(row.max_length),
      values: (row.values ?? []).map((v) => ({ id: String(v.id), label: v.label })),
      level: row.level,
      section: row.section,
      position: Number(row.position),
      filterable: row.filterable,
      customerVisible: row.customer_visible,
      variesByVariant: row.varies_by_variant,
      variantOption: row.variant_option,
    };
    if (opts.withSources) {
      mapped.sourceCategoryId = row.source_id;
      mapped.sourceCategoryName = row.source_name;
    }
    out.get(row.category_id)?.push(mapped);
  }
  return out;
}

/** Rows grouped into sections: a section comes where its first row comes (lowest position, then title). */
export function toSections(rows: readonly CategoryFormRow[]): CategoryFormSection[] {
  const sections = new Map<string, CategoryFormRow[]>();
  for (const r of rows) {
    const list = sections.get(r.section) ?? [];
    list.push(r);
    sections.set(r.section, list);
  }
  return [...sections.entries()]
    .map(([title, list]) => ({ title, rows: [...list].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.rows[0]!.position - b.rows[0]!.position || a.title.localeCompare(b.title));
}

export interface ResolvedCategory {
  categoryId: string;
  depth: number;
  isLeaf: boolean;
  path: string[];
  pathIds: string[];
  pathKeys: string[];
  defaults: FactDefaults;
}

/** An active category's resolved facts; null for an unknown or retired one. */
export async function readResolved(db: Queryable, categoryId: string): Promise<ResolvedCategory | null> {
  const r = await db.query<{
    category_id: string; depth: number; is_leaf: boolean; path_names: string[]; path_ids: string[]; path_keys: string[];
    storage: Storage | null; gst_status: GstStatus | null; age_restricted: boolean | null;
  }>(
    `SELECT category_id::text, depth, is_leaf, path_names, path_ids::text[] AS path_ids, path_keys, storage, gst_status, age_restricted
       FROM public.category_resolved WHERE category_id = $1`,
    [categoryId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    categoryId: row.category_id,
    depth: Number(row.depth),
    isLeaf: row.is_leaf,
    path: row.path_names,
    pathIds: row.path_ids,
    pathKeys: row.path_keys,
    defaults: { storage: row.storage, gstStatus: row.gst_status, ageRestricted: row.age_restricted },
  };
}

/** One category's form; null for an unknown or retired category. */
export async function readForm(db: Queryable, categoryId: string, opts: ReadFormOptions = {}): Promise<CategoryFormDTO | null> {
  const resolved = await readResolved(db, categoryId);
  if (!resolved) return null;
  const rows = (await readFormRows(db, [categoryId], opts)).get(categoryId) ?? [];
  return {
    categoryId,
    path: resolved.path,
    isLeaf: resolved.isLeaf,
    sections: toSections(rows),
    defaults: resolved.defaults,
  };
}

/** Required details each product lacks: "Allergens", or "Allergens (Mango / 500 g)" for one variant. */
export async function missingRequired(db: Queryable, productIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const id of productIds) out.set(id, []);
  if (productIds.length === 0) return out;
  const r = await db.query<{ product_id: string; attribute_name: string; label: string | null }>(
    `SELECT p.id::text AS product_id, m.attribute_name,
            (SELECT ${variantLabelSql("mv")} FROM public.product_variant mv WHERE mv.id = m.variant_id) AS label
       FROM unnest($1::uuid[]) WITH ORDINALITY AS p(id, ord)
      CROSS JOIN LATERAL public.product_missing_required(p.id) WITH ORDINALITY AS m(attribute_id, attribute_name, variant_id, n)
      ORDER BY p.ord, m.n`,
    [productIds],
  );
  for (const row of r.rows) {
    out.get(row.product_id)?.push(row.label ? `${row.attribute_name} (${row.label})` : row.attribute_name);
  }
  return out;
}

/**
 * True when product `p` is in category `category` (an SQL expression yielding its id): its home leaf, or one
 * of its extra placements, is that category or beneath it. The one definition of a category's contents.
 */
export function categoryMembershipSql(p: string, category: string): string {
  return `(EXISTS (SELECT 1 FROM public.category_ancestor cma
                    WHERE cma.ancestor_id = ${category} AND cma.category_id = ${p}.primary_category_id)
           OR EXISTS (SELECT 1 FROM public.product_placement cmp
                        JOIN public.category_ancestor cma ON cma.category_id = cmp.category_id
                       WHERE cmp.product_id = ${p}.id AND cma.ancestor_id = ${category}))`;
}

/** The same, naming the category by its key (`key` is a bind placeholder). A retired key matches nothing. */
export function categoryMembershipByKeySql(p: string, key: string): string {
  return categoryMembershipSql(p, `(SELECT mc.id FROM public.category mc WHERE mc.key = ${key} AND mc.status = 'active')`);
}
