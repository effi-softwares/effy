// The one writer of public.product_attribute_value (101), and its reader:
//  writeProductDetails  replace a product's details (every non-option attribute of its form) with the given set,
//                       checked by `validateDetails` (@effy/shared-types) — the same rules the shop console runs;
//  writeOptionDetails   a variant's option value is also its value of that attribute (filters, product page):
//                       rewritten from the options and variants; called by applyVariantSet;
//  reconcileDetails     after a category or variant change: drop values the form no longer asks for (keeping
//                       those a staff attachment hides on the product's own leaf), and collapse per-variant
//                       values when one active variant is left;
//  readProductDetails   a product's values back in their wire shape.

import {
  toBase, validateDetails, type CategoryFormRow, type DetailError, type DetailInput, type DetailValue,
} from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { readFormRows } from "./form";
import { variantLabelSql } from "./label";

export class DetailsInvalid extends Error {
  constructor(readonly errors: DetailError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.name = "DetailsInvalid";
  }
}

interface ProductContext {
  leafId: string;
  rows: CategoryFormRow[];
  activeVariants: { id: string; label: string }[];
  optionAttributeIds: string[];
}

/**
 * The product's leaf form and active variants. A retired value stays choosable for a product that already has
 * it (existing products keep theirs; only new choices are refused).
 */
async function productContext(tx: Queryable, productId: string): Promise<ProductContext> {
  const p = await tx.query<{ leaf: string; options: string[] | null }>(
    `SELECT p.primary_category_id::text AS leaf,
            (SELECT array_agg(o.attribute_id::text) FROM public.product_option o WHERE o.product_id = p.id AND o.attribute_id IS NOT NULL) AS options
       FROM public.product p WHERE p.id = $1`,
    [productId],
  );
  if (!p.rows[0]) throw new Error(`details: no product ${productId}`);
  const leafId = p.rows[0].leaf;
  const [rows, variants, retired] = await Promise.all([
    readFormRows(tx, [leafId], { includeRetiredValues: true }),
    tx.query<{ id: string; label: string | null }>(
      `SELECT v.id::text, ${variantLabelSql("v")} AS label FROM public.product_variant v
        WHERE v.product_id = $1 AND v.state = 'active' ORDER BY v.position`,
      [productId],
    ),
    tx.query<{ id: string }>(
      `SELECT v.id::text FROM public.attribute_allowed_value v
        WHERE v.status = 'retired'
          AND NOT EXISTS (SELECT 1 FROM public.product_attribute_value pav
                           WHERE pav.product_id = $1 AND v.id = ANY(pav.allowed_value_ids))`,
      [productId],
    ),
  ]);
  const refused = new Set(retired.rows.map((r) => r.id));
  return {
    leafId,
    rows: (rows.get(leafId) ?? []).map((r) => ({ ...r, values: r.values.filter((v) => !refused.has(v.id)) })),
    activeVariants: variants.rows.map((v) => ({ id: v.id, label: v.label ?? "" })),
    optionAttributeIds: p.rows[0].options ?? [],
  };
}

interface ValueColumns {
  value_text: string | null;
  value_number: string | null;
  value_unit: string | null;
  value_base: number | null;
  value_boolean: boolean | null;
  allowed_value_ids: string[] | null;
  value_date: string | null;
  value_time: string | null;
}

function columns(row: CategoryFormRow, value: DetailValue): ValueColumns {
  const c: ValueColumns = {
    value_text: null, value_number: null, value_unit: null, value_base: null, value_boolean: null,
    allowed_value_ids: null, value_date: null, value_time: null,
  };
  if ("text" in value) c.value_text = value.text.trim();
  else if ("number" in value) {
    const n = value.number.trim();
    c.value_number = n;
    c.value_unit = row.unitFamily ? (value.unit ?? null) : null;
    c.value_base = row.unitFamily && value.unit ? toBase(Number(n), row.unitFamily, value.unit) : Number(n);
  } else if ("boolean" in value) c.value_boolean = value.boolean;
  else if ("valueIds" in value) c.allowed_value_ids = [...value.valueIds];
  else if ("date" in value) c.value_date = value.date;
  else c.value_time = value.time;
  return c;
}

async function insertValue(tx: Queryable, productId: string, attributeId: string, variantId: string | null, c: ValueColumns): Promise<void> {
  await tx.query(
    `INSERT INTO public.product_attribute_value
         (product_id, attribute_definition_id, variant_id, value_text, value_number, value_unit, value_base,
          value_boolean, allowed_value_ids, value_date, value_time)
     VALUES ($1, $2, $3, $4, $5::numeric, $6, $7::numeric, $8, $9::uuid[], $10::date, $11::time)`,
    [productId, attributeId, variantId, c.value_text, c.value_number, c.value_unit, c.value_base, c.value_boolean,
      c.allowed_value_ids, c.value_date, c.value_time],
  );
}

/**
 * Inside the caller's transaction: the product's details become exactly `details` for every attribute of its
 * form that is not one of its variant options. Throws `DetailsInvalid` when a value does not fit; required
 * details are not demanded here (submission asks `product_missing_required`).
 */
export async function writeProductDetails(tx: Queryable, productId: string, details: readonly DetailInput[]): Promise<void> {
  const ctx = await productContext(tx, productId);
  const errors = validateDetails(ctx.rows, details, ctx.activeVariants, { optionAttributeIds: ctx.optionAttributeIds });
  if (errors.length > 0) throw new DetailsInvalid(errors);

  const options = new Set(ctx.optionAttributeIds);
  const owned = ctx.rows.filter((r) => !options.has(r.attributeId)).map((r) => r.attributeId);
  await tx.query(
    `DELETE FROM public.product_attribute_value WHERE product_id = $1 AND attribute_definition_id = ANY($2::uuid[])`,
    [productId, owned],
  );
  const byId = new Map(ctx.rows.map((r) => [r.attributeId, r]));
  for (const d of details) {
    const row = byId.get(d.attributeId)!;
    if (d.value !== undefined) await insertValue(tx, productId, row.attributeId, null, columns(row, d.value));
    else for (const p of d.perVariant ?? []) await insertValue(tx, productId, row.attributeId, p.variantId, columns(row, p.value));
  }
}

/** Each variant's option values written as its values of the option attributes; nothing else is touched. */
export async function writeOptionDetails(tx: Queryable, productId: string): Promise<void> {
  await tx.query(
    `DELETE FROM public.product_attribute_value pav
      USING public.product_option o
      WHERE pav.product_id = $1 AND o.product_id = $1 AND o.attribute_id = pav.attribute_definition_id`,
    [productId],
  );
  await tx.query(
    `INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, variant_id, allowed_value_ids)
     SELECT v.product_id, o.attribute_id, v.id, ARRAY[ov.allowed_value_id]
       FROM public.product_variant v
       JOIN public.product_option_value ov ON ov.id IN (v.option1_value_id, v.option2_value_id)
       JOIN public.product_option o ON o.id = ov.option_id
      WHERE v.product_id = $1 AND v.state <> 'removed' AND o.attribute_id IS NOT NULL AND ov.allowed_value_id IS NOT NULL`,
    [productId],
  );
}

/**
 * After the category or the variant set changed. Returns the names of the details it dropped (shown to the
 * shop): values the form no longer asks for — unless a staff attachment hides the attribute on the product's
 * own leaf and `dropHidden` is false (so un-hiding restores them) — and, with one active variant left,
 * per-variant values of the variants that are not it.
 */
export async function reconcileDetails(tx: Queryable, productId: string, opts: { dropHidden?: boolean } = {}): Promise<string[]> {
  const ctx = await productContext(tx, productId);
  const inForm = ctx.rows.map((r) => r.attributeId);
  const hidden = opts.dropHidden
    ? []
    : (await tx.query<{ id: string }>(
        `SELECT DISTINCT ca.attribute_id::text AS id
           FROM public.category_attribute ca
           JOIN public.category_ancestor a ON a.ancestor_id = ca.category_id
          WHERE a.category_id = $1 AND ca.hidden`,
        [ctx.leafId],
      )).rows.map((r) => r.id);

  const gone = await tx.query<{ name: string }>(
    `WITH d AS (
       DELETE FROM public.product_attribute_value pav
        WHERE pav.product_id = $1 AND NOT (pav.attribute_definition_id = ANY($2::uuid[]))
          AND NOT (pav.attribute_definition_id = ANY($3::uuid[]))
       RETURNING pav.attribute_definition_id)
     SELECT DISTINCT ad.name FROM d JOIN public.attribute_definition ad ON ad.id = d.attribute_definition_id`,
    [productId, inForm, hidden],
  );
  const dropped = gone.rows.map((r) => r.name);

  if (ctx.activeVariants.length <= 1) {
    const keep = ctx.activeVariants[0]?.id ?? null;
    const options = new Set(ctx.optionAttributeIds);
    const perVariant = await tx.query<{ attribute_id: string; name: string; has_keep: boolean; others: boolean }>(
      `SELECT pav.attribute_definition_id::text AS attribute_id, ad.name,
              bool_or(pav.variant_id = $2) AS has_keep, bool_or(pav.variant_id IS DISTINCT FROM $2) AS others
         FROM public.product_attribute_value pav
         JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
        WHERE pav.product_id = $1 AND pav.variant_id IS NOT NULL
        GROUP BY pav.attribute_definition_id, ad.name`,
      [productId, keep],
    );
    for (const a of perVariant.rows) {
      if (options.has(a.attribute_id)) continue;
      await tx.query(
        `DELETE FROM public.product_attribute_value
          WHERE product_id = $1 AND attribute_definition_id = $2 AND variant_id IS DISTINCT FROM $3 AND variant_id IS NOT NULL`,
        [productId, a.attribute_id, keep],
      );
      if (a.has_keep) {
        await tx.query(
          `UPDATE public.product_attribute_value SET variant_id = NULL, updated_at = now()
            WHERE product_id = $1 AND attribute_definition_id = $2 AND variant_id = $3`,
          [productId, a.attribute_id, keep],
        );
      }
      if (a.others) dropped.push(a.name);
    }
  }
  return [...new Set(dropped)];
}

interface ValueRowSql {
  product_id: string;
  attribute_id: string;
  variant_id: string | null;
  value_text: string | null;
  value_number: string | null;
  value_unit: string | null;
  value_boolean: boolean | null;
  allowed_value_ids: string[] | null;
  value_date: string | null;
  value_time: string | null;
}

/** "1.500" → "1.5": numbers read back as typed. */
function trimNumber(n: string): string {
  return n.includes(".") ? n.replace(/0+$/, "").replace(/\.$/, "") : n;
}

function toValue(r: ValueRowSql): DetailValue {
  if (r.value_text !== null) return { text: r.value_text };
  if (r.value_number !== null) return { number: trimNumber(r.value_number), unit: r.value_unit };
  if (r.value_boolean !== null) return { boolean: r.value_boolean };
  if (r.allowed_value_ids !== null) return { valueIds: r.allowed_value_ids };
  if (r.value_date !== null) return { date: r.value_date };
  return { time: (r.value_time ?? "").slice(0, 5) };
}

/**
 * Each product's stored values as `DetailInput`s (option-derived values included: they carry `perVariant`).
 * `excludeOptions` leaves out the product's option attributes (the shop edits those through its options).
 */
export async function readProductDetails(
  db: Queryable,
  productIds: readonly string[],
  opts: { excludeOptions?: boolean } = {},
): Promise<Map<string, DetailInput[]>> {
  const out = new Map<string, DetailInput[]>();
  for (const id of productIds) out.set(id, []);
  if (productIds.length === 0) return out;
  const r = await db.query<ValueRowSql>(
    `SELECT pav.product_id::text, pav.attribute_definition_id::text AS attribute_id, pav.variant_id::text,
            pav.value_text, pav.value_number::text, pav.value_unit, pav.value_boolean,
            pav.allowed_value_ids::text[] AS allowed_value_ids, to_char(pav.value_date, 'YYYY-MM-DD') AS value_date,
            pav.value_time::text
       FROM public.product_attribute_value pav
      WHERE pav.product_id = ANY($1::uuid[])
        AND NOT ($2 AND EXISTS (SELECT 1 FROM public.product_option o
                                 WHERE o.product_id = pav.product_id AND o.attribute_id = pav.attribute_definition_id))
      ORDER BY pav.product_id, pav.attribute_definition_id, pav.variant_id NULLS FIRST`,
    [productIds, opts.excludeOptions === true],
  );
  const byProduct = new Map<string, Map<string, DetailInput>>();
  for (const row of r.rows) {
    const attrs = byProduct.get(row.product_id) ?? new Map<string, DetailInput>();
    byProduct.set(row.product_id, attrs);
    const d = attrs.get(row.attribute_id) ?? { attributeId: row.attribute_id };
    if (row.variant_id === null) d.value = toValue(row);
    else (d.perVariant ??= []).push({ variantId: row.variant_id, value: toValue(row) });
    attrs.set(row.attribute_id, d);
  }
  for (const [productId, attrs] of byProduct) out.set(productId, [...attrs.values()]);
  return out;
}
