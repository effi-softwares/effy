// The one writer of the taxonomy (101): categories, the attribute library and its values, and attachments.
// Every function runs in the caller's transaction, takes the taxonomy lock first (two concurrent moves cannot
// build a cycle), checks its rules against the derived tables, writes, and rebuilds the derived tables with
// public.rebuild_category_derived() — the one definition of inheritance. The caller audits and announces.
//
// A value label renamed here is also rewritten in `product_option_value.value`, the label copy order lines
// read (the only other writer of that copy is applyVariantSet).

import {
  CATEGORY_DEPTH_MAX,
  CATEGORY_NAME_MAX,
  INPUT_TYPES,
  isCategoryIcon,
  isStockDateName,
  levelRank,
  SECTION_MAX,
  SYNONYMS_MAX,
  UNIT_FAMILIES,
  VALUE_LABEL_MAX,
  ATTRIBUTE_NAME_MAX,
  FILTERABLE_INPUT_TYPES,
  CHOICE_INPUT_TYPES,
  type AttachmentInput,
  type AttributeInput,
  type CategoryIcon,
  type FactDefaults,
  type InputType,
  type TaxonomyStatus,
  type UnitFamily,
} from "@effy/shared-types";

import type { Queryable } from "../lib/db";

export type TaxonomyRefusalKind = "validation" | "conflict" | "not_found";

/** A refusal with a stable `code` (the problem's machine word) and, for bad input, the fields. */
export class TaxonomyRefusal extends Error {
  constructor(
    readonly kind: TaxonomyRefusalKind,
    readonly code: string,
    message: string,
    readonly fields?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "TaxonomyRefusal";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (code: string, field: string, message: string) => new TaxonomyRefusal("validation", code, message, [{ field, message }]);
const conflict = (code: string, message: string) => new TaxonomyRefusal("conflict", code, message);
const notFound = (what: string) => new TaxonomyRefusal("not_found", "not_found", `${what} not found`);

async function lock(tx: Queryable): Promise<void> {
  await tx.query(`LOCK TABLE public.category IN SHARE ROW EXCLUSIVE MODE`);
}

async function rebuild(tx: Queryable): Promise<void> {
  await tx.query(`SELECT public.rebuild_category_derived()`);
}

function slug(name: string, sep: "-" | "_"): string {
  const s = name.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return s.replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "") || "item";
}

/** A key for a new row: the slug, else the slug with the parent's key in front, else numbered. */
async function freeKey(tx: Queryable, table: "category" | "attribute_definition", base: string, prefix: string | null, sep: "-" | "_"): Promise<string> {
  const candidates = [base, ...(prefix ? [`${prefix}${sep}${base}`] : [])];
  for (let i = 2; i < 50; i += 1) candidates.push(`${base}${sep}${i}`);
  const taken = new Set((await tx.query<{ key: string }>(`SELECT key FROM public.${table} WHERE key = ANY($1::text[])`, [candidates])).rows.map((r) => r.key));
  const key = candidates.find((k) => !taken.has(k));
  if (!key) throw conflict("key_unavailable", "could not find a free key for that name");
  return key;
}

function cleanName(raw: unknown, max: number, field = "name"): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > max) throw invalid("invalid_name", field, `must be 1 to ${max} characters`);
  return name;
}

function cleanSynonyms(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw invalid("invalid_synonyms", "synonyms", "must be a list of words");
  const out: string[] = [];
  for (const s of raw) {
    const w = typeof s === "string" ? s.trim().toLowerCase().replace(/\s+/g, " ") : "";
    if (w.length < 1 || w.length > 40) throw invalid("invalid_synonyms", "synonyms", "each synonym must be 1 to 40 characters");
    if (!out.includes(w)) out.push(w);
  }
  if (out.length > SYNONYMS_MAX) throw invalid("invalid_synonyms", "synonyms", `at most ${SYNONYMS_MAX} synonyms`);
  return out;
}

function cleanIcon(raw: unknown): CategoryIcon | null {
  if (raw === null) return null;
  if (!isCategoryIcon(raw)) throw invalid("invalid_icon", "icon", "choose one of the category icons");
  return raw;
}

interface DefaultsPatch {
  storage?: FactDefaults["storage"];
  gstStatus?: FactDefaults["gstStatus"];
  ageRestricted?: FactDefaults["ageRestricted"];
}

function cleanDefaults(raw: unknown): DefaultsPatch {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null) throw invalid("invalid_defaults", "defaults", "must be an object");
  const r = raw as Record<string, unknown>;
  const out: DefaultsPatch = {};
  if ("storage" in r) {
    if (r.storage !== null && !["frozen", "chilled", "ambient"].includes(String(r.storage))) throw invalid("invalid_defaults", "defaults.storage", "must be frozen, chilled, ambient or null");
    out.storage = r.storage as FactDefaults["storage"];
  }
  if ("gstStatus" in r) {
    if (r.gstStatus !== null && !["taxable", "gst_free"].includes(String(r.gstStatus))) throw invalid("invalid_defaults", "defaults.gstStatus", "must be taxable, gst_free or null");
    out.gstStatus = r.gstStatus as FactDefaults["gstStatus"];
  }
  if ("ageRestricted" in r) {
    if (r.ageRestricted !== null && typeof r.ageRestricted !== "boolean") throw invalid("invalid_defaults", "defaults.ageRestricted", "must be yes, no or null");
    out.ageRestricted = r.ageRestricted as boolean | null;
  }
  return out;
}

interface CategoryRow {
  id: string;
  parent_id: string | null;
  key: string;
  name: string;
  status: TaxonomyStatus;
}

async function category(tx: Queryable, id: string): Promise<CategoryRow> {
  if (!UUID.test(id)) throw notFound("category");
  const r = await tx.query<CategoryRow>(`SELECT id::text, parent_id::text, key, name, status FROM public.category WHERE id = $1`, [id]);
  if (!r.rows[0]) throw notFound("category");
  return r.rows[0];
}

/** An active category's depth, or null when it is retired. */
async function depthOf(tx: Queryable, id: string): Promise<number | null> {
  const r = await tx.query<{ depth: number }>(`SELECT depth FROM public.category_resolved WHERE category_id = $1`, [id]);
  return r.rows[0] ? Number(r.rows[0].depth) : null;
}

/** Products filed in exactly this category (any status), and whether any is not archived. */
async function homeProducts(tx: Queryable, id: string): Promise<{ any: number; live: number }> {
  const r = await tx.query<{ any: number; live: number }>(
    `SELECT count(*)::int AS any, count(*) FILTER (WHERE status <> 'archived')::int AS live FROM public.product WHERE primary_category_id = $1`,
    [id],
  );
  return r.rows[0] ?? { any: 0, live: 0 };
}

async function hasActiveChildren(tx: Queryable, id: string): Promise<boolean> {
  return ((await tx.query(`SELECT 1 FROM public.category WHERE parent_id = $1 AND status = 'active' LIMIT 1`, [id])).rowCount ?? 0) > 0;
}

async function requireSiblingNameFree(tx: Queryable, parentId: string | null, name: string, exceptId: string | null): Promise<void> {
  const r = await tx.query(
    `SELECT 1 FROM public.category
      WHERE parent_id IS NOT DISTINCT FROM $1 AND lower(name) = lower($2) AND status = 'active' AND id IS DISTINCT FROM $3 LIMIT 1`,
    [parentId, name, exceptId],
  );
  if ((r.rowCount ?? 0) > 0) throw invalid("category_sibling_name_taken", "name", "another category here already has that name");
}

/** A parent that is home to products stops being a leaf only if its products move into the new child. */
async function adoptProducts(tx: Queryable, parentId: string, childId: string, consent: boolean | undefined): Promise<void> {
  const home = await homeProducts(tx, parentId);
  const placed = ((await tx.query(`SELECT 1 FROM public.product_placement WHERE category_id = $1 LIMIT 1`, [parentId])).rowCount ?? 0) > 0;
  if (home.any === 0 && !placed) return;
  if (!consent) {
    throw conflict("category_has_products", `${home.any} product(s) are filed in this category; agree to move them into the new sub-category`);
  }
  await tx.query(`UPDATE public.product SET primary_category_id = $2, updated_at = now() WHERE primary_category_id = $1`, [parentId, childId]);
  await tx.query(
    `UPDATE public.product_placement pp SET category_id = $2
      WHERE pp.category_id = $1
        AND NOT EXISTS (SELECT 1 FROM public.product_placement x WHERE x.product_id = pp.product_id AND x.category_id = $2)`,
    [parentId, childId],
  );
  await tx.query(`DELETE FROM public.product_placement WHERE category_id = $1`, [parentId]);
}

async function nextPosition(tx: Queryable, parentId: string | null): Promise<number> {
  const r = await tx.query<{ p: number | null }>(`SELECT max("position") AS p FROM public.category WHERE parent_id IS NOT DISTINCT FROM $1`, [parentId]);
  return (r.rows[0]?.p ?? -10) + 10;
}

export interface CreateCategory {
  parentId: string | null;
  name: unknown;
  icon?: unknown;
  synonyms?: unknown;
  defaults?: unknown;
  moveProductsToSelf?: boolean;
}

export async function createCategory(tx: Queryable, input: CreateCategory): Promise<string> {
  await lock(tx);
  const name = cleanName(input.name, CATEGORY_NAME_MAX);
  const icon = input.icon === undefined ? null : cleanIcon(input.icon);
  const synonyms = input.synonyms === undefined ? [] : cleanSynonyms(input.synonyms);
  const defaults = cleanDefaults(input.defaults);
  let parentKey: string | null = null;
  if (input.parentId !== null) {
    const parent = await category(tx, input.parentId);
    if (parent.status !== "active") throw conflict("parent_retired", "the parent category is retired");
    const depth = await depthOf(tx, parent.id);
    if (depth === null) throw conflict("parent_retired", "the parent category is retired");
    if (depth + 1 > CATEGORY_DEPTH_MAX) throw conflict("category_too_deep", `the tree is ${CATEGORY_DEPTH_MAX} levels deep at most`);
    parentKey = parent.key;
  }
  await requireSiblingNameFree(tx, input.parentId, name, null);
  const key = await freeKey(tx, "category", slug(name, "-"), parentKey, "-");
  const id = (await tx.query<{ id: string }>(
    `INSERT INTO public.category (key, parent_id, name, "position", icon, synonyms, default_storage, default_gst_status, default_age_restricted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text`,
    [key, input.parentId, name, await nextPosition(tx, input.parentId), icon, synonyms,
      defaults.storage ?? null, defaults.gstStatus ?? null, defaults.ageRestricted ?? null],
  )).rows[0]!.id;
  if (input.parentId !== null) await adoptProducts(tx, input.parentId, id, input.moveProductsToSelf);
  await rebuild(tx);
  return id;
}

export interface UpdateCategory {
  name?: unknown;
  icon?: unknown;
  imageKey?: unknown;
  synonyms?: unknown;
  defaults?: unknown;
}

export async function updateCategory(tx: Queryable, id: string, patch: UpdateCategory): Promise<void> {
  await lock(tx);
  const current = await category(tx, id);
  const sets: string[] = [];
  const args: unknown[] = [id];
  const set = (column: string, value: unknown) => {
    args.push(value);
    sets.push(`${column} = $${args.length}`);
  };
  if (patch.name !== undefined) {
    const name = cleanName(patch.name, CATEGORY_NAME_MAX);
    if (current.status === "active") await requireSiblingNameFree(tx, current.parent_id, name, id);
    set("name", name);
  }
  if (patch.icon !== undefined) set("icon", cleanIcon(patch.icon));
  if (patch.imageKey !== undefined) {
    if (patch.imageKey !== null && (typeof patch.imageKey !== "string" || !patch.imageKey.startsWith(`categories/${id}/`) || patch.imageKey.includes(".."))) {
      throw invalid("invalid_image", "imageKey", "upload the picture for this category first");
    }
    set("image_key", patch.imageKey);
  }
  if (patch.synonyms !== undefined) set("synonyms", cleanSynonyms(patch.synonyms));
  const defaults = cleanDefaults(patch.defaults);
  if ("storage" in defaults) set("default_storage", defaults.storage);
  if ("gstStatus" in defaults) set("default_gst_status", defaults.gstStatus);
  if ("ageRestricted" in defaults) set("default_age_restricted", defaults.ageRestricted);
  if (sets.length === 0) return;
  await tx.query(`UPDATE public.category SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, args);
  await rebuild(tx);
}

/** Re-parent and/or reorder: `position` is the zero-based place among the new siblings. */
export async function moveCategory(tx: Queryable, id: string, parentId: string | null, position: number): Promise<void> {
  await lock(tx);
  const current = await category(tx, id);
  if (current.status !== "active") throw conflict("category_retired", "restore the category before moving it");
  if (!Number.isInteger(position) || position < 0) throw invalid("invalid_position", "position", "must be a whole number from 0");
  if (parentId !== null) {
    if (parentId === id) throw conflict("category_cycle", "a category cannot sit under itself");
    const parent = await category(tx, parentId);
    if (parent.status !== "active") throw conflict("parent_retired", "the new parent is retired");
    const inside = await tx.query(`SELECT 1 FROM public.category_ancestor WHERE ancestor_id = $1 AND category_id = $2`, [id, parentId]);
    if ((inside.rowCount ?? 0) > 0) throw conflict("category_cycle", "a category cannot sit under one of its own sub-categories");
    const parentDepth = (await depthOf(tx, parentId))!;
    const height = Number((await tx.query<{ h: number }>(
      `SELECT COALESCE(max(distance), 0)::int AS h FROM public.category_ancestor WHERE ancestor_id = $1`, [id],
    )).rows[0]!.h);
    if (parentDepth + 1 + height > CATEGORY_DEPTH_MAX) throw conflict("category_too_deep", `the tree is ${CATEGORY_DEPTH_MAX} levels deep at most`);
    if (parentId !== current.parent_id) {
      const home = await homeProducts(tx, parentId);
      const placed = ((await tx.query(`SELECT 1 FROM public.product_placement WHERE category_id = $1 LIMIT 1`, [parentId])).rowCount ?? 0) > 0;
      if (home.any > 0 || placed) throw conflict("category_has_products", "products are filed in the new parent; add a sub-category there instead");
    }
  }
  if (parentId !== current.parent_id) await requireSiblingNameFree(tx, parentId, current.name, id);
  // Siblings in order, this one taken out and put back at `position`.
  const siblings = (await tx.query<{ id: string }>(
    `SELECT id::text FROM public.category WHERE parent_id IS NOT DISTINCT FROM $1 AND id <> $2 ORDER BY "position", name`,
    [parentId, id],
  )).rows.map((r) => r.id);
  siblings.splice(Math.min(position, siblings.length), 0, id);
  await tx.query(`UPDATE public.category SET parent_id = $2, updated_at = now() WHERE id = $1`, [id, parentId]);
  for (const [i, sid] of siblings.entries()) {
    await tx.query(`UPDATE public.category SET "position" = $2 WHERE id = $1`, [sid, i * 10]);
  }
  await rebuild(tx);
}

export async function setCategoryStatus(tx: Queryable, id: string, status: TaxonomyStatus, moveProductsToSelf?: boolean): Promise<void> {
  await lock(tx);
  const current = await category(tx, id);
  if (status !== "active" && status !== "retired") throw invalid("invalid_status", "status", "must be active or retired");
  if (current.status === status) return;
  if (status === "retired") {
    if (await hasActiveChildren(tx, id)) throw conflict("category_has_children", "retire or move its sub-categories first");
    const home = await homeProducts(tx, id);
    if (home.live > 0) throw conflict("category_in_use", `${home.live} product(s) are filed in this category; move them first`);
    await tx.query(`DELETE FROM public.product_placement WHERE category_id = $1`, [id]);
  } else {
    if (current.parent_id !== null) {
      const parent = await category(tx, current.parent_id);
      if (parent.status !== "active") throw conflict("parent_retired", "restore its parent first");
      const parentDepth = await depthOf(tx, parent.id);
      if (parentDepth !== null && parentDepth + 1 > CATEGORY_DEPTH_MAX) throw conflict("category_too_deep", `the tree is ${CATEGORY_DEPTH_MAX} levels deep at most`);
    }
    await requireSiblingNameFree(tx, current.parent_id, current.name, id);
  }
  await tx.query(`UPDATE public.category SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  if (status === "active" && current.parent_id !== null) await adoptProducts(tx, current.parent_id, id, moveProductsToSelf);
  await rebuild(tx);
}

// ── The attribute library ───────────────────────────────────────────────────────────────────────────────

interface AttributeRow {
  id: string;
  key: string;
  name: string;
  input_type: InputType;
  unit_family: UnitFamily | null;
  status: TaxonomyStatus;
}

async function attribute(tx: Queryable, id: string): Promise<AttributeRow> {
  if (!UUID.test(id)) throw notFound("attribute");
  const r = await tx.query<AttributeRow>(
    `SELECT id::text, key, name, input_type, unit_family, status FROM public.attribute_definition WHERE id = $1`, [id],
  );
  if (!r.rows[0]) throw notFound("attribute");
  return r.rows[0];
}

async function attributeUsed(tx: Queryable, id: string): Promise<number> {
  return Number((await tx.query<{ n: number }>(
    `SELECT count(DISTINCT product_id)::int AS n FROM public.product_attribute_value WHERE attribute_definition_id = $1`, [id],
  )).rows[0]!.n);
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

interface CleanAttribute {
  name: string;
  helpText: string | null;
  inputType: InputType;
  unitFamily: UnitFamily | null;
  units: string[] | null;
  min: string | null;
  max: string | null;
  decimals: number | null;
  maxLength: number | null;
  filterable: boolean;
  customerVisible: boolean;
  variesByVariant: boolean;
  variantOption: boolean;
  values: { id?: string; label: string; status: TaxonomyStatus }[];
}

/** Every rule an attribute must meet, all refusals at once. */
function cleanAttribute(raw: Partial<AttributeInput>): CleanAttribute {
  const fields: { field: string; message: string }[] = [];
  const add = (field: string, message: string) => fields.push({ field, message });
  let name = "";
  try {
    name = cleanName(raw.name, ATTRIBUTE_NAME_MAX);
  } catch (e) {
    add("name", (e as TaxonomyRefusal).message);
  }
  if (name && isStockDateName(name)) {
    throw new TaxonomyRefusal("validation", "attribute_is_stock_date", "expiry, packed and batch dates belong to stock, not to product details", [
      { field: "name", message: "a stock date or batch is recorded with stock, not as a detail" },
    ]);
  }
  const inputType = raw.inputType as InputType;
  if (!INPUT_TYPES.includes(inputType)) add("inputType", "choose an input type");
  const helpText = typeof raw.helpText === "string" && raw.helpText.trim() !== "" ? raw.helpText.trim() : null;
  if (helpText && helpText.length > 200) add("helpText", "must be 200 characters or fewer");
  const isNumber = inputType === "number";
  const isText = inputType === "short_text" || inputType === "long_text";
  const isChoice = CHOICE_INPUT_TYPES.includes(inputType);

  const unitFamily = raw.unitFamily ?? null;
  let units: string[] | null = null;
  if (unitFamily !== null) {
    if (!isNumber) add("unitFamily", "only a number has units");
    else if (!(unitFamily in UNIT_FAMILIES)) add("unitFamily", "choose a unit family");
    else {
      units = Array.isArray(raw.units) ? [...new Set(raw.units.map(String))] : [];
      const allowed = Object.keys(UNIT_FAMILIES[unitFamily].units);
      if (units.length === 0) add("units", "choose at least one unit");
      if (units.some((u) => !allowed.includes(u))) add("units", `must be among ${allowed.join(", ")}`);
      if (unitFamily === "count" && units.length !== 1) add("units", "a count names exactly one unit");
    }
  } else if (Array.isArray(raw.units) && raw.units.length > 0) add("units", "choose a unit family first");

  const num = (v: unknown, field: string): string | null => {
    if (v === null || v === undefined || v === "") return null;
    if (!isNumber) {
      add(field, "only a number has limits");
      return null;
    }
    if (!DECIMAL.test(String(v))) {
      add(field, "must be a number");
      return null;
    }
    return String(v);
  };
  const min = num(raw.min, "min");
  const max = num(raw.max, "max");
  if (min !== null && max !== null && Number(min) > Number(max)) add("max", "must not be below the minimum");
  const decimals = raw.decimals === null || raw.decimals === undefined ? null : Number(raw.decimals);
  if (decimals !== null && (!isNumber || !Number.isInteger(decimals) || decimals < 0 || decimals > 3)) add("decimals", "a number allows 0 to 3 decimal places");
  const maxLength = raw.maxLength === null || raw.maxLength === undefined ? null : Number(raw.maxLength);
  if (maxLength !== null && (!isText || !Number.isInteger(maxLength) || maxLength < 1 || maxLength > 2000)) add("maxLength", "text allows 1 to 2000 characters");

  const filterable = raw.filterable === true;
  if (filterable && !FILTERABLE_INPUT_TYPES.includes(inputType)) add("filterable", "only choices, yes/no and numbers can be filters");
  const variantOption = raw.variantOption === true;
  if (variantOption && inputType !== "single_select") add("variantOption", "only a single choice can be a variant option");
  const variesByVariant = raw.variesByVariant === true || variantOption;

  const values: CleanAttribute["values"] = [];
  if (Array.isArray(raw.values)) {
    const seen = new Set<string>();
    raw.values.forEach((v, i) => {
      const label = typeof v?.label === "string" ? v.label.trim().replace(/\s+/g, " ") : "";
      if (label.length < 1 || label.length > VALUE_LABEL_MAX) add(`values[${i}].label`, `must be 1 to ${VALUE_LABEL_MAX} characters`);
      else if (seen.has(label.toLowerCase())) add(`values[${i}].label`, "this value is already on the list");
      seen.add(label.toLowerCase());
      if (v?.id !== undefined && !UUID.test(String(v.id))) add(`values[${i}].id`, "is not a value of this attribute");
      values.push({ id: v?.id, label, status: v?.status === "retired" ? "retired" : "active" });
    });
  }
  if (isChoice && !values.some((v) => v.status === "active")) add("values", "a choice needs at least one value");
  if (!isChoice && values.length > 0) add("values", "only a choice has values");

  if (fields.length > 0) throw new TaxonomyRefusal("validation", "invalid_attribute", "the attribute is not valid", fields);
  return {
    name, helpText, inputType, unitFamily: unitFamily as UnitFamily | null, units, min, max, decimals, maxLength,
    filterable, customerVisible: raw.customerVisible !== false, variesByVariant, variantOption, values,
  };
}

async function requireAttributeNameFree(tx: Queryable, name: string, exceptId: string | null): Promise<void> {
  const r = await tx.query(`SELECT 1 FROM public.attribute_definition WHERE lower(name) = lower($1) AND id IS DISTINCT FROM $2`, [name, exceptId]);
  if ((r.rowCount ?? 0) > 0) throw invalid("attribute_name_taken", "name", "another attribute already has that name");
}

/** The values become exactly this ordered list: new ones added, labels and statuses updated, unused ones gone. */
async function writeValues(tx: Queryable, attributeId: string, values: CleanAttribute["values"]): Promise<void> {
  const existing = new Map((await tx.query<{ id: string; label: string }>(
    `SELECT id::text, label FROM public.attribute_allowed_value WHERE attribute_definition_id = $1`, [attributeId],
  )).rows.map((r) => [r.id, r.label]));
  for (const v of values) if (v.id && !existing.has(v.id)) throw invalid("invalid_attribute", "values", "a value does not belong to this attribute");
  const kept = new Set(values.flatMap((v) => (v.id ? [v.id] : [])));
  const dropped = [...existing.keys()].filter((id) => !kept.has(id));
  if (dropped.length > 0) {
    const used = await tx.query<{ label: string }>(
      `SELECT DISTINCT v.label FROM public.attribute_allowed_value v
        WHERE v.id = ANY($1::uuid[])
          AND (EXISTS (SELECT 1 FROM public.product_attribute_value pav WHERE v.id = ANY(pav.allowed_value_ids))
               OR EXISTS (SELECT 1 FROM public.product_option_value ov WHERE ov.allowed_value_id = v.id))`,
      [dropped],
    );
    if (used.rows.length > 0) {
      throw new TaxonomyRefusal("conflict", "value_in_use", "products use these values; retire them instead", used.rows.map((r) => ({ field: "values", message: `${r.label} is in use` })));
    }
    await tx.query(`DELETE FROM public.attribute_allowed_value WHERE id = ANY($1::uuid[])`, [dropped]);
  }
  // Labels move through a placeholder so a swap of two labels does not trip the unique index.
  await tx.query(`UPDATE public.attribute_allowed_value SET label = id::text WHERE attribute_definition_id = $1`, [attributeId]);
  for (const [i, v] of values.entries()) {
    if (v.id) {
      await tx.query(`UPDATE public.attribute_allowed_value SET label = $2, "position" = $3, status = $4 WHERE id = $1`, [v.id, v.label, i * 10, v.status]);
      if (existing.get(v.id) !== v.label) {
        // The label copy every order line and document reads (product_option_value.value).
        await tx.query(`UPDATE public.product_option_value SET value = $2 WHERE allowed_value_id = $1`, [v.id, v.label]);
      }
    } else {
      await tx.query(
        `INSERT INTO public.attribute_allowed_value (attribute_definition_id, label, "position", status) VALUES ($1, $2, $3, $4)`,
        [attributeId, v.label, i * 10, v.status],
      );
    }
  }
}

export async function createAttribute(tx: Queryable, raw: Partial<AttributeInput>): Promise<string> {
  await lock(tx);
  const a = cleanAttribute(raw);
  await requireAttributeNameFree(tx, a.name, null);
  const key = await freeKey(tx, "attribute_definition", slug(a.name, "_"), null, "_");
  const id = (await tx.query<{ id: string }>(
    `INSERT INTO public.attribute_definition
         (key, name, help_text, input_type, unit_family, units, min_value, max_value, decimals, max_length,
          filterable, customer_visible, varies_by_variant, variant_option)
     VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9, $10, $11, $12, $13, $14) RETURNING id::text`,
    [key, a.name, a.helpText, a.inputType, a.unitFamily, a.units, a.min, a.max, a.decimals, a.maxLength,
      a.filterable, a.customerVisible, a.variesByVariant, a.variantOption],
  )).rows[0]!.id;
  await writeValues(tx, id, a.values);
  await rebuild(tx);
  return id;
}

/** A partial update is laid over the current attribute, then checked whole. */
export async function updateAttribute(tx: Queryable, id: string, patch: Partial<AttributeInput>): Promise<void> {
  await lock(tx);
  const current = await attribute(tx, id);
  const row = (await tx.query<{
    help_text: string | null; units: string[] | null; min_value: string | null; max_value: string | null; decimals: number | null;
    max_length: number | null; filterable: boolean; customer_visible: boolean; varies_by_variant: boolean; variant_option: boolean;
  }>(
    `SELECT help_text, units, min_value::text, max_value::text, decimals, max_length, filterable, customer_visible, varies_by_variant, variant_option
       FROM public.attribute_definition WHERE id = $1`, [id],
  )).rows[0]!;
  const values = patch.values ?? (await tx.query<{ id: string; label: string; status: TaxonomyStatus }>(
    `SELECT id::text, label, status FROM public.attribute_allowed_value WHERE attribute_definition_id = $1 ORDER BY "position", label`, [id],
  )).rows;
  const merged: Partial<AttributeInput> = {
    name: patch.name ?? current.name,
    helpText: "helpText" in patch ? patch.helpText : row.help_text,
    inputType: patch.inputType ?? current.input_type,
    unitFamily: "unitFamily" in patch ? patch.unitFamily : current.unit_family,
    units: "units" in patch ? patch.units : row.units,
    min: "min" in patch ? patch.min : row.min_value,
    max: "max" in patch ? patch.max : row.max_value,
    decimals: "decimals" in patch ? patch.decimals : row.decimals,
    maxLength: "maxLength" in patch ? patch.maxLength : row.max_length,
    filterable: patch.filterable ?? row.filterable,
    customerVisible: patch.customerVisible ?? row.customer_visible,
    variesByVariant: patch.variesByVariant ?? row.varies_by_variant,
    variantOption: patch.variantOption ?? row.variant_option,
    values,
  };
  // A used attribute's input type and unit family are fixed — refused before the new shape is judged.
  if (merged.inputType !== current.input_type || (merged.unitFamily ?? null) !== current.unit_family) {
    const used = await attributeUsed(tx, id);
    if (used > 0) throw conflict("attribute_in_use", `${used} product(s) use this attribute; its input type and unit family are fixed`);
  }
  const a = cleanAttribute(merged);
  if (a.name.toLowerCase() !== current.name.toLowerCase()) await requireAttributeNameFree(tx, a.name, id);
  await tx.query(
    `UPDATE public.attribute_definition
        SET name = $2, help_text = $3, input_type = $4, unit_family = $5, units = $6, min_value = $7::numeric, max_value = $8::numeric,
            decimals = $9, max_length = $10, filterable = $11, customer_visible = $12, varies_by_variant = $13, variant_option = $14,
            updated_at = now()
      WHERE id = $1`,
    [id, a.name, a.helpText, a.inputType, a.unitFamily, a.units, a.min, a.max, a.decimals, a.maxLength,
      a.filterable, a.customerVisible, a.variesByVariant, a.variantOption],
  );
  await writeValues(tx, id, a.values);
  await rebuild(tx);
}

export async function setAttributeStatus(tx: Queryable, id: string, status: TaxonomyStatus): Promise<void> {
  await lock(tx);
  const current = await attribute(tx, id);
  if (status !== "active" && status !== "retired") throw invalid("invalid_status", "status", "must be active or retired");
  if (current.status === status) return;
  if (status === "retired") {
    const used = await attributeUsed(tx, id);
    if (used > 0) throw conflict("attribute_in_use", `${used} product(s) use this attribute`);
  }
  await tx.query(`UPDATE public.attribute_definition SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  await rebuild(tx);
}

// ── Attachments ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Attach, tighten, restate or hide `attributeId` on a category. A level looser than what the category
 * inherits is refused (`attachment_loosens`); hiding needs something inherited to hide (`nothing_to_hide`).
 */
export async function putAttachment(tx: Queryable, categoryId: string, attributeId: string, input: AttachmentInput): Promise<void> {
  await lock(tx);
  const cat = await category(tx, categoryId);
  if (cat.status !== "active") throw conflict("category_retired", "restore the category first");
  const attr = await attribute(tx, attributeId);
  const hidden = input.hidden === true;
  const inherited = cat.parent_id
    ? (await tx.query<{ level: "required" | "recommended" | "optional" }>(
        `SELECT level FROM public.category_form WHERE category_id = $1 AND attribute_id = $2`, [cat.parent_id, attributeId],
      )).rows[0] ?? null
    : null;
  let level: "required" | "recommended" | "optional" | null = null;
  if (hidden) {
    if (!inherited) throw conflict("nothing_to_hide", "this category does not inherit that attribute");
  } else {
    if (attr.status !== "active") throw conflict("attribute_retired", "that attribute is retired");
    if (input.level !== "required" && input.level !== "recommended" && input.level !== "optional") {
      throw invalid("invalid_attachment", "level", "choose required, recommended or optional");
    }
    level = input.level;
    if (inherited && levelRank(level) < levelRank(inherited.level)) {
      throw conflict("attachment_loosens", `it is ${inherited.level} above; a sub-category may only tighten it`);
    }
  }
  const section = input.section === undefined || input.section === null || input.section.trim() === "" ? null : input.section.trim();
  if (section && section.length > SECTION_MAX) throw invalid("invalid_attachment", "section", `must be ${SECTION_MAX} characters or fewer`);
  const position = input.position === undefined || input.position === null ? null : Number(input.position);
  if (position !== null && (!Number.isInteger(position) || position < 0 || position > 100000)) throw invalid("invalid_attachment", "position", "must be a whole number from 0");
  await tx.query(
    `INSERT INTO public.category_attribute (category_id, attribute_id, level, hidden, section, "position")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (category_id, attribute_id) DO UPDATE
        SET level = EXCLUDED.level, hidden = EXCLUDED.hidden, section = EXCLUDED.section, "position" = EXCLUDED."position"`,
    [categoryId, attributeId, level, hidden, hidden ? null : section, hidden ? null : position],
  );
  await rebuild(tx);
}

export async function deleteAttachment(tx: Queryable, categoryId: string, attributeId: string): Promise<void> {
  await lock(tx);
  const r = await tx.query(`DELETE FROM public.category_attribute WHERE category_id = $1 AND attribute_id = $2`, [categoryId, attributeId]);
  if ((r.rowCount ?? 0) === 0) throw new TaxonomyRefusal("not_found", "attachment_not_found", "this category has no such attachment");
  await rebuild(tx);
}
