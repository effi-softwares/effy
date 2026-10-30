// One writer of a product's content outside review (102): the shop creates and edits its drafts through
// it, and Effy creates products for a shop and finishes them through it. Parsing and validation are the
// shop form's rules, whoever sends the form; `INSERT INTO public.product` lives here and nowhere else
// (`authoring.guard.test.ts`). An approved product's content changes only through review.

import type {
  DetailInput, DetailValue, FactKey, GstStatus, OptionInputDTO, Storage, UnitBasis, VariantInputDTO, CategoryFormRow,
} from "@effy/shared-types";
import { STORAGES, UNIT_BASES, validateDetails, validateOptionsAgainstForm, validateVariantSet } from "@effy/shared-types";

import type { FieldError } from "../lib/http";
import type { Queryable } from "../lib/db";
import { isGstStatus, recordGstOnCreate, setGstStatus } from "../documents/gst-status";
import { reconcileDetails, writeProductDetails } from "./details";
import { missingRequired, readFormRows, readResolved } from "./form";
import { applyVariantSet } from "./variants";

/** A product's content as the form sends it, parsed and validated. */
export interface ProductContentInput {
  /** An active leaf. */
  primaryCategoryId: string;
  name: string;
  brand: string | null;
  shortDescription: string;
  longDescription: string | null;
  /** Resolved: as sent, else the leaf's default. */
  gstStatus: GstStatus;
  storage: Storage;
  ageRestricted: boolean;
  unitBasis: UnitBasis | null;
  /** Validated by `validateVariantSet` inside `applyVariantSet`. */
  options: OptionInputDTO[];
  variants: VariantInputDTO[];
  details: DetailInput[];
  sectionIds: string[];
  media: { storageKey: string; isPrimary: boolean; altText: string | null; displayOrder: number }[];
}

export type LeafCheck =
  | { kind: "leaf"; defaults: { storage: Storage | null; gstStatus: GstStatus | null; ageRestricted: boolean | null } }
  | { kind: "not_leaf" }
  | { kind: "unknown" };

/** What validation reads, passed in so each caller (and its tests) decide where it comes from. */
export interface AuthoringDeps {
  checkLeaf: (categoryId: string) => Promise<LeafCheck>;
  formRows: (categoryId: string) => Promise<CategoryFormRow[]>;
}

export function optText(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** The trimmed value, or a field error and null. */
export function requireNonEmpty(value: unknown, field: string, fields: FieldError[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    fields.push({ field, message: "must be a non-empty string" });
    return null;
  }
  return value.trim();
}

/** One value in wire shape; `null` when it is not one of the six value shapes. Its fit is `validateDetails`'s. */
export function parseValue(raw: unknown): DetailValue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r).filter((k) => r[k] !== undefined);
  if (typeof r.text === "string" && keys.length === 1) return { text: r.text };
  if ((typeof r.number === "string" || typeof r.number === "number") && keys.every((k) => k === "number" || k === "unit")) {
    return { number: String(r.number), unit: typeof r.unit === "string" ? r.unit : null };
  }
  if (typeof r.boolean === "boolean" && keys.length === 1) return { boolean: r.boolean };
  if (Array.isArray(r.valueIds) && keys.length === 1 && r.valueIds.every((x) => typeof x === "string")) return { valueIds: r.valueIds as string[] };
  if (typeof r.date === "string" && keys.length === 1) return { date: r.date };
  if (typeof r.time === "string" && keys.length === 1) return { time: r.time };
  return null;
}

/** `details` as sent, or null when absent. Shape only: whether each value fits its attribute is `validateDetails`'s. */
export function parseDetails(body: Record<string, unknown>, fields: FieldError[]): DetailInput[] | null {
  if (!("details" in body) || body.details === undefined) return null;
  if (!Array.isArray(body.details)) {
    fields.push({ field: "details", message: "must be a list" });
    return null;
  }
  const out: DetailInput[] = [];
  (body.details as unknown[]).forEach((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const attributeId = typeof r.attributeId === "string" ? r.attributeId : "";
    if (!attributeId) {
      fields.push({ field: `details[${i}].attributeId`, message: "is required" });
      return;
    }
    if (r.value !== undefined) {
      const value = parseValue(r.value);
      if (!value) fields.push({ field: `details[${i}].value`, message: "is not a value" });
      else out.push({ attributeId, value });
      return;
    }
    if (Array.isArray(r.perVariant)) {
      const perVariant: { variantId: string; value: DetailValue }[] = [];
      for (const [j, p] of (r.perVariant as unknown[]).entries()) {
        const pr = (p ?? {}) as Record<string, unknown>;
        const value = parseValue(pr.value);
        if (typeof pr.variantId !== "string" || !value) fields.push({ field: `details[${i}].perVariant[${j}]`, message: "needs a variant and a value" });
        else perVariant.push({ variantId: pr.variantId, value });
      }
      out.push({ attributeId, perVariant });
      return;
    }
    fields.push({ field: `details[${i}]`, message: "send a value or one per variant" });
  });
  return out;
}

export const isStorage = (v: unknown): v is Storage => typeof v === "string" && (STORAGES as readonly string[]).includes(v);
export const FACT_KEYS: readonly FactKey[] = ["storage", "gstStatus", "ageRestricted"];

/** The three facts as sent: `undefined` = not sent. */
export function parseFacts(body: Record<string, unknown>, fields: FieldError[]): { storage?: Storage; gstStatus?: GstStatus; ageRestricted?: boolean } {
  const out: { storage?: Storage; gstStatus?: GstStatus; ageRestricted?: boolean } = {};
  if ("storage" in body && body.storage !== undefined) {
    if (isStorage(body.storage)) out.storage = body.storage;
    else fields.push({ field: "storage", message: "choose Room temperature, Chilled or Frozen" });
  }
  if ("gstStatus" in body && body.gstStatus !== undefined) {
    if (isGstStatus(body.gstStatus)) out.gstStatus = body.gstStatus;
    else fields.push({ field: "gstStatus", message: "choose Taxable or GST-free" });
  }
  if ("ageRestricted" in body && body.ageRestricted !== undefined) {
    if (typeof body.ageRestricted === "boolean") out.ageRestricted = body.ageRestricted;
    else fields.push({ field: "ageRestricted", message: "must be yes or no" });
  }
  return out;
}

/** A leaf the shop may file in, with its defaults; a field error otherwise. */
export async function leafOrError(
  categoryId: string,
  fields: FieldError[],
  checkLeaf: (categoryId: string) => Promise<LeafCheck>,
): Promise<(LeafCheck & { kind: "leaf" }) | null> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const check: LeafCheck = UUID.test(categoryId) ? await checkLeaf(categoryId) : { kind: "unknown" };
  if (check.kind === "unknown") fields.push({ field: "primaryCategoryId", message: "is not an active category" });
  else if (check.kind === "not_leaf") fields.push({ field: "primaryCategoryId", message: "category_not_leaf: choose a category with no sub-categories" });
  return check.kind === "leaf" ? check : null;
}

/** The sets in wire shape, or null when neither is sent; both must come together. Rules are `validateVariantSet`'s. */
export function parseVariantSet(body: Record<string, unknown>, fields: FieldError[]): { options: OptionInputDTO[]; variants: VariantInputDTO[] } | null {
  const hasOptions = "options" in body && body.options !== undefined;
  const hasVariants = "variants" in body && body.variants !== undefined;
  if (!hasOptions && !hasVariants) return null;
  if (!Array.isArray(body.options) || !Array.isArray(body.variants)) {
    fields.push({ field: "variants", message: "send the options and the variants together" });
    return null;
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const strOrNull = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? null : String(v));
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : -1);
  const options: OptionInputDTO[] = (body.options as unknown[]).map((o) => {
    const r = (o ?? {}) as Record<string, unknown>;
    return {
      id: str(r.id), position: int(r.position),
      // An empty id fails the rules' "choose which detail this option is".
      attributeId: str(r.attributeId),
      values: Array.isArray(r.values)
        ? (r.values as unknown[]).map((v) => {
            const x = (v ?? {}) as Record<string, unknown>;
            return { id: str(x.id), allowedValueId: str(x.allowedValueId), position: int(x.position) };
          })
        : [],
    };
  });
  const variants: VariantInputDTO[] = (body.variants as unknown[]).map((v) => {
    const r = (v ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(r.optionValueIds) ? (r.optionValueIds as unknown[]) : [];
    return {
      id: str(r.id), position: int(r.position),
      optionValueIds: [typeof ids[0] === "string" ? ids[0] : null, typeof ids[1] === "string" ? ids[1] : null],
      sku: strOrNull(r.sku), gtin: strOrNull(r.gtin),
      shopPriceAmount: typeof r.shopPriceAmount === "number" ? String(r.shopPriceAmount) : str(r.shopPriceAmount),
      shopCompareAtAmount: strOrNull(r.shopCompareAtAmount),
      weightGrams: normaliseWeight(r.weightGrams, fields),
      packQuantity: strOrNull(r.packQuantity),
      packUnit: (strOrNull(r.packUnit) as VariantInputDTO["packUnit"]) ?? null,
      mediaStorageKey: strOrNull(r.mediaStorageKey),
    };
  });
  return { options, variants };
}

/** `undefined` = not sent; null = cleared. */
export function parseUnitBasis(body: Record<string, unknown>, fields: FieldError[]): UnitBasis | null | undefined {
  if (!("unitBasis" in body) || body.unitBasis === undefined) return undefined;
  if (body.unitBasis === null || body.unitBasis === "") return null;
  if (typeof body.unitBasis === "string" && (UNIT_BASES as readonly string[]).includes(body.unitBasis)) return body.unitBasis as UnitBasis;
  fields.push({ field: "unitBasis", message: `must be one of ${UNIT_BASES.join(", ")}` });
  return undefined;
}

export async function parseCreateInput(
  body: Record<string, unknown>,
  deps: AuthoringDeps,
): Promise<{ ok: true; input: ProductContentInput } | { ok: false; fields: FieldError[] }> {
  const fields: FieldError[] = [];
  const name = optText(body.name);
  if (!name) fields.push({ field: "name", message: "must be a non-empty string" });
  const shortDescription = optText(body.shortDescription);
  if (!shortDescription) fields.push({ field: "shortDescription", message: "must be a non-empty string" });

  const primaryCategoryId = typeof body.primaryCategoryId === "string" ? body.primaryCategoryId : "";
  if (!primaryCategoryId) fields.push({ field: "primaryCategoryId", message: "is required" });
  const leaf = primaryCategoryId ? await leafOrError(primaryCategoryId, fields, deps.checkLeaf) : null;

  // Every product is created with its variants: one when it has no options.
  const unitBasis = parseUnitBasis(body, fields) ?? null;
  const variantSet = parseVariantSet(body, fields);
  if (!variantSet) fields.push({ field: "variants", message: "a product needs at least one variant with a price" });
  else fields.push(...validateVariantSet(variantSet.options, variantSet.variants, unitBasis));

  // Media is optional at create (a draft; the image follows). Required details and a primary image are checked at submit.
  const mediaInput = normaliseMedia(body.media, body.primaryMediaStorageKey, fields);
  const details = parseDetails(body, fields) ?? [];

  // Facts left out take the leaf's defaults; one with no default must be chosen.
  const facts = parseFacts(body, fields);
  const storage = facts.storage ?? leaf?.defaults.storage ?? null;
  const gstStatus = facts.gstStatus ?? leaf?.defaults.gstStatus ?? null;
  const ageRestricted = facts.ageRestricted ?? leaf?.defaults.ageRestricted ?? null;
  if (leaf) {
    if (storage === null) fields.push({ field: "storage", message: "fact_required: choose how it is kept" });
    if (gstStatus === null) fields.push({ field: "gstStatus", message: "fact_required: choose Taxable or GST-free" });
    if (ageRestricted === null) fields.push({ field: "ageRestricted", message: "fact_required: say whether it is 18+" });
    // The pure rules against the leaf's form before anything is written.
    const rows = await deps.formRows(primaryCategoryId);
    if (variantSet) fields.push(...validateOptionsAgainstForm(variantSet.options, rows));
    const optionIds = (variantSet?.options ?? []).flatMap((o) => (o.attributeId ? [o.attributeId] : []));
    const variants = (variantSet?.variants ?? []).map((v) => ({ id: v.id, label: "" }));
    fields.push(...validateDetails(rows, details, variants, { optionAttributeIds: optionIds }));
  }

  if (fields.length > 0) return { ok: false, fields };

  const input: ProductContentInput = {
    primaryCategoryId,
    name: name!,
    brand: optText(body.brand),
    shortDescription: shortDescription!,
    longDescription: optText(body.longDescription),
    gstStatus: gstStatus!,
    storage: storage!,
    ageRestricted: ageRestricted!,
    unitBasis,
    options: variantSet!.options,
    variants: variantSet!.variants,
    details,
    sectionIds: Array.isArray(body.sectionIds) ? (body.sectionIds as unknown[]).filter((s): s is string => typeof s === "string") : [],
    media: mediaInput,
  };

  return { ok: true, input };
}


export function normaliseMedia(
  rawMedia: unknown,
  primaryKey: unknown,
  fields: FieldError[],
): ProductContentInput["media"] {
  const list: ProductContentInput["media"] = [];
  if (Array.isArray(rawMedia)) {
    rawMedia.forEach((m, i) => {
      const r = m as Record<string, unknown>;
      if (typeof r?.storageKey !== "string" || r.storageKey.length === 0) {
        fields.push({ field: `media[${i}].storageKey`, message: "is required" });
        return;
      }
      list.push({
        storageKey: r.storageKey,
        isPrimary: r.isPrimary === true,
        altText: optText(r.altText),
        displayOrder: typeof r.displayOrder === "number" ? Math.floor(r.displayOrder) : i,
      });
    });
  }
  // A single `primaryMediaStorageKey` shorthand.
  if (typeof primaryKey === "string" && primaryKey.length > 0 && !list.some((m) => m.storageKey === primaryKey)) {
    list.push({ storageKey: primaryKey, isPrimary: true, altText: null, displayOrder: 0 });
  }
  if (list.length === 0) return list;
  // Exactly one primary: default the first, refuse more than one.
  const primaries = list.filter((m) => m.isPrimary);
  if (primaries.length === 0) list[0]!.isPrimary = true;
  else if (primaries.length > 1) fields.push({ field: "media", message: "only one image can be primary" });
  return list;
}


/**
 * Null for "not supplied" (keep the default), never 0: a zero weight ships free and the check refuses it.
 * There is no client path to `weightIsAssumed`; it follows from supplying a weight.
 */
export function normaliseWeight(raw: unknown, fields: FieldError[]): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    fields.push({ field: "weightGrams", message: "must be a whole number of grams" });
    return null;
  }
  if (n <= 0) {
    fields.push({ field: "weightGrams", message: "must be greater than zero — a weightless product would ship free" });
    return null;
  }
  // A quarter-tonne single item is a typo (250000 for 250g).
  if (n > 250_000) {
    fields.push({ field: "weightGrams", message: "is over 250 kg — check the units (this field is GRAMS)" });
    return null;
  }
  return n;
}

/** Who is writing: the shop's own staff, or Effy (by hand or from an import), and Effy's margin for its own. */
export type AuthoringActor =
  | { kind: "shop"; sub: string }
  | { kind: "effy"; sub: string; margin: { kind: "percent" | "amount"; value: string } }
  | { kind: "import"; sub: string; margin: { kind: "percent" | "amount"; value: string }; importId: string };

/**
 * One transaction (the caller's): the product, its pictures, sections, sizes and details. A product Effy
 * creates is Effy's to finish (`content_owner = 'effy'`) and carries the margin chosen at creation; it never
 * enters the review queue. The writers' refusals (`VariantSetInvalid`, `DetailsInvalid`) and a duplicate SKU
 * (23505) propagate for the caller to map.
 */
export async function insertProduct(
  tx: Queryable,
  shopId: string,
  input: ProductContentInput,
  actor: AuthoringActor,
): Promise<string> {
  const effy = actor.kind !== "shop";
  const ins = await tx.query<{ id: string }>(
    `INSERT INTO public.product
         (shop_id, primary_category_id, name, brand, short_description, long_description, created_by, unit_basis,
          gst_status, storage, age_restricted, content_owner, created_via, import_id, margin_kind, margin_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::numeric)
      RETURNING id`,
    [
      shopId,
      input.primaryCategoryId,
      input.name,
      input.brand,
      input.shortDescription,
      input.longDescription,
      actor.sub,
      input.unitBasis,
      input.gstStatus,
      input.storage,
      input.ageRestricted,
      effy ? "effy" : "shop",
      actor.kind,
      actor.kind === "import" ? actor.importId : null,
      effy ? actor.margin.kind : null,
      effy ? actor.margin.value : null,
    ],
  );
  const productId = ins.rows[0]!.id;
  await recordGstOnCreate(tx, productId, effy ? { kind: "admin_staff", sub: actor.sub } : { kind: "shop_staff", sub: actor.sub });

  for (const m of input.media) {
    await tx.query(
      `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order, alt_text)
            VALUES ($1, $2, $3, $4, $5)`,
      [productId, m.storageKey, m.isPrimary, m.displayOrder, m.altText],
    );
  }
  for (const sectionId of input.sectionIds) {
    await tx.query(
      `INSERT INTO public.product_section (product_id, shop_section_id)
            VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [productId, sectionId],
    );
  }
  // Variants through the one writer, after the pictures (a variant may name one); details after the
  // variants (a detail may name one).
  await applyVariantSet(tx, {
    productId, shopId, options: input.options, variants: input.variants, unitBasis: input.unitBasis, mode: "draft",
  });
  await writeProductDetails(tx, productId, input.details);
  return productId;
}

/**
 * Effy finishing a product it created (102): the complete form replaces the draft in place, under the version
 * staff saw. Only while it is still Effy's (`content_owner = 'effy'`, never approved); `false` when it has
 * moved on (stale, approved, or the shop's now). Pictures not in the form go, after the sizes stop naming them.
 */
export async function replaceEffyDraft(
  tx: Queryable,
  args: { productId: string; shopId: string; version: string; input: ProductContentInput; sub: string },
): Promise<{ replaced: false } | { replaced: true; droppedDetails: string[] }> {
  const { productId, shopId, input } = args;
  const before = await tx.query<{ leaf: string }>(
    `SELECT primary_category_id::text AS leaf FROM public.product
      WHERE id = $1 AND shop_id = $2 AND content_owner = 'effy' AND approved_at IS NULL AND updated_at::text = $3
        FOR UPDATE`,
    [productId, shopId, args.version],
  );
  if (!before.rows[0]) return { replaced: false };

  await tx.query(
    `UPDATE public.product SET
         name = $2, primary_category_id = $3, brand = $4, short_description = $5, long_description = $6,
         storage = $7, age_restricted = $8, unit_basis = $9, updated_at = now()
      WHERE id = $1`,
    [productId, input.name, input.primaryCategoryId, input.brand, input.shortDescription, input.longDescription,
      input.storage, input.ageRestricted, input.unitBasis],
  );
  await setGstStatus(tx, productId, input.gstStatus, { kind: "admin_staff", sub: args.sub }, "direct");

  const dropped: string[] = [];
  if (before.rows[0].leaf !== input.primaryCategoryId) dropped.push(...(await reconcileDetails(tx, productId, { dropHidden: true })));

  // Pictures first (a size may name one): the primary is unique, so clear it before setting it.
  const keys = input.media.map((m) => m.storageKey);
  await tx.query(`UPDATE public.product_media SET is_primary = false WHERE product_id = $1`, [productId]);
  for (const m of input.media) {
    const upd = await tx.query(
      `UPDATE public.product_media SET is_primary = $3, display_order = $4, alt_text = $5
        WHERE product_id = $1 AND storage_key = $2`,
      [productId, m.storageKey, m.isPrimary, m.displayOrder, m.altText],
    );
    if ((upd.rowCount ?? 0) === 0) {
      await tx.query(
        `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order, alt_text)
              VALUES ($1, $2, $3, $4, $5)`,
        [productId, m.storageKey, m.isPrimary, m.displayOrder, m.altText],
      );
    }
  }
  const r = await applyVariantSet(tx, {
    productId, shopId, options: input.options, variants: input.variants, unitBasis: input.unitBasis, mode: "draft",
  });
  dropped.push(...r.droppedDetails);
  await writeProductDetails(tx, productId, input.details);
  await tx.query(`DELETE FROM public.product_media WHERE product_id = $1 AND NOT (storage_key = ANY($2::text[]))`, [productId, keys]);
  return { replaced: true, droppedDetails: [...new Set(dropped)] };
}

/** The form's reads straight from the database, for callers with no reason to read them another way. */
export function authoringDepsFor(db: Queryable): AuthoringDeps {
  return {
    checkLeaf: async (categoryId) => {
      const resolved = await readResolved(db, categoryId).catch(() => null);
      if (!resolved) return { kind: "unknown" };
      if (!resolved.isLeaf) return { kind: "not_leaf" };
      return { kind: "leaf", defaults: resolved.defaults };
    },
    formRows: async (categoryId) => (await readFormRows(db, [categoryId])).get(categoryId) ?? [],
  };
}

/** What still stops a product going on sale: required details, a main picture, a size on sale. Empty = complete. */
export async function completenessIssues(tx: Queryable, productId: string): Promise<string[]> {
  const issues = [...((await missingRequired(tx, [productId])).get(productId) ?? [])];
  const facts = await tx.query<{ picture: boolean; on_sale: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.product_media m WHERE m.product_id = $1 AND m.is_primary) AS picture,
            EXISTS (SELECT 1 FROM public.product_variant v WHERE v.product_id = $1 AND v.state = 'active') AS on_sale`,
    [productId],
  );
  if (!facts.rows[0]?.picture) issues.unshift("a main picture");
  if (!facts.rows[0]?.on_sale) issues.push("a size on sale");
  return issues;
}
