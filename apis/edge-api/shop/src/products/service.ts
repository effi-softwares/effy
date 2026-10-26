// Validation, the details form and the presign boundary (keys → short-lived urls). `shopId` is always the resolved actor shop.
import { emitMetric, metricNamespace, query, withTransaction } from "@effy/edge-shared";
import { readForm, readFormRows, setVariantState as writeVariantState } from "@effy/edge-shared/catalog";
import { isGstStatus } from "@effy/edge-shared/documents";
import { announce } from "@effy/edge-shared/live";
import {
  recategorise, STORAGES, UNIT_BASES, validateDetails, validateOptionsAgainstForm, validateVariantSet,
  type CategoryFormDTO, type DetailInput, type DetailValue, type FactKey, type GstStatus, type OptionInputDTO,
  type ShopTaxonomyDTO, type Storage, type UnitBasis, type VariantInputDTO,
} from "@effy/shared-types";

import * as media from "./media";
import * as repo from "./repository";
import * as change from "./change";
import {
  type CreateProductInput,
  type FieldIssue,
  type ListParams,
  type Paged,
  type ProductDetail,
  ProductError,
  type ProductListItem,
  PRODUCT_STATUSES,
  type ProductStatus,
  type ShopReviewState,
} from "./types";

const REVIEW_STATES: readonly ShopReviewState[] = [
  "draft",
  "in_review",
  "sent_back",
  "live",
  "live_change_pending",
  "live_change_sent_back",
];

const PRICE_RE = /^\d+(\.\d{1,2})?$/;
const SORTS = ["name", "price", "recent"] as const;

export function getShopTaxonomy(shopId: string): Promise<ShopTaxonomyDTO> {
  return repo.readShopTaxonomy(shopId);
}

/** A leaf's form for the details step; a parent is `category_not_leaf` (a product is filed in a leaf). */
export async function getCategoryForm(categoryId: string): Promise<CategoryFormDTO> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const form = UUID.test(categoryId) ? await readForm({ query }, categoryId) : null;
  if (!form) throw new ProductError("not_found", "category not found");
  if (!form.isLeaf) {
    throw new ProductError("validation", "category_not_leaf", [{ field: "primaryCategoryId", message: "choose a category with no sub-categories" }]);
  }
  return form;
}

function optText(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** The trimmed value, or a field error and null. */
function requireNonEmpty(value: unknown, field: string, fields: FieldIssue[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    fields.push({ field, message: "must be a non-empty string" });
    return null;
  }
  return value.trim();
}

/** One value in wire shape; `null` when it is not one of the six value shapes. Its fit is `validateDetails`'s. */
function parseValue(raw: unknown): DetailValue | null {
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
function parseDetails(body: Record<string, unknown>, fields: FieldIssue[]): DetailInput[] | null {
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

const isStorage = (v: unknown): v is Storage => typeof v === "string" && (STORAGES as readonly string[]).includes(v);
const FACT_KEYS: readonly FactKey[] = ["storage", "gstStatus", "ageRestricted"];

/** The three facts as sent: `undefined` = not sent. */
function parseFacts(body: Record<string, unknown>, fields: FieldIssue[]): { storage?: Storage; gstStatus?: GstStatus; ageRestricted?: boolean } {
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
async function leafOrError(categoryId: string, fields: FieldIssue[]): Promise<repo.LeafCheck & { kind: "leaf" } | null> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const check: repo.LeafCheck = UUID.test(categoryId) ? await repo.checkLeaf(categoryId) : { kind: "unknown" };
  if (check.kind === "unknown") fields.push({ field: "primaryCategoryId", message: "is not an active category" });
  else if (check.kind === "not_leaf") fields.push({ field: "primaryCategoryId", message: "category_not_leaf: choose a category with no sub-categories" });
  return check.kind === "leaf" ? check : null;
}

/** The sets in wire shape, or null when neither is sent; both must come together. Rules are `validateVariantSet`'s. */
function parseVariantSet(body: Record<string, unknown>, fields: FieldIssue[]): { options: OptionInputDTO[]; variants: VariantInputDTO[] } | null {
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
      kind: (r.kind === "pack_size" ? "pack_size" : r.kind === "attribute" ? "attribute" : str(r.kind)) as OptionInputDTO["kind"],
      attributeId: typeof r.attributeId === "string" ? r.attributeId : null,
      values: Array.isArray(r.values)
        ? (r.values as unknown[]).map((v) => {
            const x = (v ?? {}) as Record<string, unknown>;
            return { id: str(x.id), allowedValueId: typeof x.allowedValueId === "string" ? x.allowedValueId : null, position: int(x.position) };
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
function parseUnitBasis(body: Record<string, unknown>, fields: FieldIssue[]): UnitBasis | null | undefined {
  if (!("unitBasis" in body) || body.unitBasis === undefined) return undefined;
  if (body.unitBasis === null || body.unitBasis === "") return null;
  if (typeof body.unitBasis === "string" && (UNIT_BASES as readonly string[]).includes(body.unitBasis)) return body.unitBasis as UnitBasis;
  fields.push({ field: "unitBasis", message: `must be one of ${UNIT_BASES.join(", ")}` });
  return undefined;
}

export async function createProduct(
  shopId: string,
  body: Record<string, unknown>,
  createdBy: string,
): Promise<ProductDetail> {
  const fields: FieldIssue[] = [];
  const name = optText(body.name);
  if (!name) fields.push({ field: "name", message: "must be a non-empty string" });
  const shortDescription = optText(body.shortDescription);
  if (!shortDescription) fields.push({ field: "shortDescription", message: "must be a non-empty string" });

  const primaryCategoryId = typeof body.primaryCategoryId === "string" ? body.primaryCategoryId : "";
  if (!primaryCategoryId) fields.push({ field: "primaryCategoryId", message: "is required" });
  const leaf = primaryCategoryId ? await leafOrError(primaryCategoryId, fields) : null;

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
    const rows = (await readFormRows({ query }, [primaryCategoryId])).get(primaryCategoryId) ?? [];
    if (variantSet) fields.push(...validateOptionsAgainstForm(variantSet.options, rows));
    const optionIds = (variantSet?.options ?? []).flatMap((o) => (o.attributeId ? [o.attributeId] : []));
    const variants = (variantSet?.variants ?? []).map((v) => ({ id: v.id, label: "" }));
    fields.push(...validateDetails(rows, details, variants, { optionAttributeIds: optionIds }));
  }

  if (fields.length > 0) throw new ProductError("validation", "invalid product", fields);

  const input: CreateProductInput = {
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

  const id = await repo.createProduct(shopId, input, createdBy);
  return getProduct(shopId, id);
}

function normaliseMedia(
  rawMedia: unknown,
  primaryKey: unknown,
  fields: FieldIssue[],
): CreateProductInput["media"] {
  const list: CreateProductInput["media"] = [];
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

export async function presignUpload(
  shopId: string,
  productId: string,
  contentType: unknown,
  fileSize: unknown,
): Promise<{ uploadUrl: string; storageKey: string }> {
  if (!(await repo.productBelongsToShop(shopId, productId))) {
    throw new ProductError("not_found", "product not found");
  }
  return media.presignUpload(productId, contentType, fileSize);
}

export async function registerMedia(
  shopId: string,
  productId: string,
  body: Record<string, unknown>,
): Promise<import("./types").ProductMedia> {
  if (!(await repo.productBelongsToShop(shopId, productId))) {
    throw new ProductError("not_found", "product not found");
  }
  const storageKey = typeof body.storageKey === "string" ? body.storageKey : "";
  if (!storageKey) {
    throw new ProductError("validation", "invalid media", [{ field: "storageKey", message: "is required" }]);
  }
  const input = {
    storageKey,
    isPrimary: body.isPrimary === true,
    altText: optText(body.altText),
    displayOrder: typeof body.displayOrder === "number" ? Math.floor(body.displayOrder) : 0,
  };
  // An image added to an approved product is proposed, live only after approval.
  const approved = await isApproved(shopId, productId);
  const registered = approved
    ? await change.registerChangeMedia(shopId, productId, input)
    : await repo.registerMedia(productId, input);
  if (!registered) throw new ProductError("not_found", "product not found");
  if (!approved) await repo.touchProduct(shopId, productId);
  return { ...registered, url: await media.presignRead(registered.storageKey) };
}

export async function listProducts(
  shopId: string,
  params: {
    page?: unknown;
    pageSize?: unknown;
    q?: unknown;
    missing?: unknown;
    category?: unknown;
    section?: unknown;
    status?: unknown;
    reviewState?: unknown;
    priceMin?: unknown;
    priceMax?: unknown;
    sort?: unknown;
    order?: unknown;
  },
): Promise<Paged<ProductListItem>> {
  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(toPositiveInt(params.pageSize, 20), 100);
  const status =
    typeof params.status === "string" && (PRODUCT_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as ProductStatus)
      : null;
  const sort = typeof params.sort === "string" && (SORTS as readonly string[]).includes(params.sort)
    ? (params.sort as ListParams["sort"])
    : "recent";
  const order = params.order === "asc" ? "asc" : "desc";
  const clean: ListParams = {
    page,
    pageSize,
    q: optText(params.q),
    category: optText(params.category),
    section: optText(params.section),
    status,
    reviewState: REVIEW_STATES.includes(params.reviewState as ShopReviewState)
      ? (params.reviewState as ShopReviewState)
      : null,
    priceMin: numericStr(params.priceMin),
    priceMax: numericStr(params.priceMax),
    missing: params.missing === "true" || params.missing === true,
    sort,
    order,
  };
  const paged = await repo.listProducts(shopId, clean);
  const items = await Promise.all(
    paged.items.map(async (item) => ({
      ...item,
      primaryImageUrl: item.primaryImageUrl ? await media.presignRead(item.primaryImageUrl) : null,
    })),
  );
  return { ...paged, items };
}

export async function updateProduct(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
  /** For the GST status history. */
  actorSub: string,
): Promise<ProductDetail> {
  const live = await repo.getProductDetail(shopId, id);
  if (!live) throw new ProductError("not_found", "product not found");

  // A never-approved product is edited in place; an approved one gets a proposal, merged and diffed, never writing the live row.
  const pending = live.approved ? await change.readChange(shopId, id) : null;
  const current = live.approved ? change.overlay(live, pending?.proposed ?? null) : live;

  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  // The concurrency token guards the live row; a proposal needs none.
  if (!live.approved && !expectedUpdatedAt) {
    throw new ProductError("validation", "invalid update", [
      { field: "expectedUpdatedAt", message: "is required (optimistic concurrency token)" },
    ]);
  }

  const fields: FieldIssue[] = [];
  const name = "name" in body ? requireNonEmpty(body.name, "name", fields) ?? current.name : current.name;
  const shortDescription =
    "shortDescription" in body ? requireNonEmpty(body.shortDescription, "shortDescription", fields) ?? current.shortDescription : current.shortDescription;
  const primaryCategoryId = "primaryCategoryId" in body && typeof body.primaryCategoryId === "string" ? body.primaryCategoryId : current.primaryCategoryId;
  const recategorised = primaryCategoryId !== current.primaryCategoryId;
  const leaf = recategorised ? await leafOrError(primaryCategoryId, fields) : null;

  // Variant sets, when sent, are the complete target; the basis likewise.
  const unitBasisSent = parseUnitBasis(body, fields);
  const unitBasis = unitBasisSent === undefined ? current.unitBasis : unitBasisSent;
  const sentSet = parseVariantSet(body, fields);
  const baseSet = live.approved ? change.proposedVariantInputs(live, pending?.proposed ?? null) : change.liveVariantInputs(live);
  const targetSet = sentSet ?? baseSet;
  if (sentSet || unitBasisSent !== undefined) fields.push(...validateVariantSet(targetSet.options, targetSet.variants, unitBasis));

  // Facts: as sent; on a new leaf those the shop never changed by hand take its defaults (FR-024).
  const facts = parseFacts(body, fields);
  const touched = new Set<FactKey>(Array.isArray(body.factsTouched) ? (body.factsTouched as unknown[]).filter((k): k is FactKey => FACT_KEYS.includes(k as FactKey)) : []);
  const fact = <K extends FactKey>(k: K, sent: ProductDetail[K] | undefined): ProductDetail[K] => {
    if (sent !== undefined) return sent;
    if (leaf && !touched.has(k) && leaf.defaults[k] !== null) return leaf.defaults[k] as ProductDetail[K];
    return current[k];
  };
  const storage = fact("storage", facts.storage);
  const gstStatus = fact("gstStatus", facts.gstStatus);
  const ageRestricted = fact("ageRestricted", facts.ageRestricted);

  // Details: as sent (the complete set), else the current ones; a new leaf drops what it does not ask for.
  const sentDetails = parseDetails(body, fields);
  let targetDetails = sentDetails ?? current.details;
  const rows = (await readFormRows({ query }, [primaryCategoryId])).get(primaryCategoryId) ?? [];
  if (recategorised && sentDetails === null) {
    const oldRows = (await readFormRows({ query }, [current.primaryCategoryId])).get(current.primaryCategoryId) ?? [];
    targetDetails = recategorise({ details: targetDetails, facts: { storage, gstStatus, ageRestricted }, factsTouched: [...touched] }, oldRows, rows, leaf?.defaults ?? current.factDefaults).details;
  }
  if (sentSet || recategorised) fields.push(...validateOptionsAgainstForm(targetSet.options, rows));
  if (sentDetails !== null || recategorised) {
    const optionIds = targetSet.options.flatMap((o) => (o.attributeId ? [o.attributeId] : []));
    const variants = targetSet.variants.map((v) => ({ id: v.id, label: "" }));
    fields.push(...validateDetails(rows, targetDetails, variants, { optionAttributeIds: optionIds }));
  }

  if (fields.length > 0) throw new ProductError("validation", "invalid update", fields);

  if (live.approved) {
    const target: change.TargetValues = {
      name,
      primaryCategoryId,
      brand: "brand" in body ? optText(body.brand) : current.brand,
      shortDescription,
      longDescription: "longDescription" in body ? optText(body.longDescription) : current.longDescription,
      // On a live product the facts, the category and the details are proposed and reviewed.
      gstStatus,
      storage,
      ageRestricted,
      // So are options and variants.
      unitBasis,
      options: targetSet.options,
      variants: targetSet.variants,
      details: targetDetails,
    };
    const saved = await change.saveProposal(shopId, id, change.diffProposal(live, target));
    if (saved === "not_found") throw new ProductError("not_found", "product not found");
    return getProduct(shopId, id);
  }

  const result = await repo.updateProduct(
    shopId,
    id,
    expectedUpdatedAt,
    {
      name,
      primaryCategoryId,
      brand: "brand" in body ? optText(body.brand) : current.brand,
      shortDescription,
      longDescription: "longDescription" in body ? optText(body.longDescription) : current.longDescription,
      gstStatus,
      storage,
      ageRestricted,
      unitBasis: unitBasisSent,
      variantSet: sentSet,
      details: sentDetails ?? (recategorised ? targetDetails : null),
    },
    actorSub,
  );
  if (result.outcome === "stale") {
    throw new ProductError("conflict", "product changed since you loaded it — reload and try again");
  }
  return { ...(await getProduct(shopId, id)), droppedDetails: result.droppedDetails };
}

export async function changeStatus(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<ProductDetail> {
  const status = typeof body.status === "string" ? body.status : "";
  if (!(PRODUCT_STATUSES as readonly string[]).includes(status)) {
    throw new ProductError("validation", "invalid status", [
      { field: "status", message: `must be one of ${PRODUCT_STATUSES.join(", ")}` },
    ]);
  }
  // A never-approved product cannot go on sale (submit for review instead); an approved one taken off sale goes back at once.
  if (status === "active") {
    const facts = await repo.reviewFacts(shopId, id);
    if (!facts) throw new ProductError("not_found", "product not found");
    if (!facts.approved) {
      throw new ProductError("conflict", "submit this product for review — Effy approves a product before it goes on sale");
    }
  }
  // Back on sale needs a primary image. A required detail staff added after approval does not block it:
  // the product stays sellable and is listed as missing that detail (101 FR-016).
  if (status === "active" && !(await repo.hasPrimaryImage(shopId, id))) {
    throw new ProductError("validation", "cannot publish — missing required fields", [
      { field: "media", message: "a primary image is required to publish" },
    ]);
  }
  const ok = await repo.changeStatus(shopId, id, status as ProductStatus);
  if (!ok) throw new ProductError("not_found", "product not found");
  return getProduct(shopId, id);
}

export async function deleteProduct(shopId: string, id: string): Promise<void> {
  const outcome = await repo.hardDeleteProduct(shopId, id);
  if (outcome === "not_found") throw new ProductError("not_found", "product not found");
  if (outcome === "blocked") {
    throw new ProductError("conflict", "a published product cannot be hard-deleted — archive it instead");
  }
}

export async function setSections(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<ProductDetail> {
  const sectionIds = Array.isArray(body.sectionIds)
    ? (body.sectionIds as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const ok = await repo.setProductSections(shopId, id, sectionIds);
  if (!ok) throw new ProductError("not_found", "product not found");
  return getProduct(shopId, id);
}

export async function patchMedia(
  shopId: string,
  productId: string,
  mediaId: string,
  body: Record<string, unknown>,
): Promise<import("./types").ProductMedia> {
  const patch = {
    isPrimary: typeof body.isPrimary === "boolean" ? body.isPrimary : undefined,
    displayOrder: typeof body.displayOrder === "number" ? Math.floor(body.displayOrder) : undefined,
    altText: "altText" in body ? optText(body.altText) : undefined,
  };
  const approved = await isApproved(shopId, productId);
  const updated = approved
    ? await change.updateChangeMedia(shopId, productId, mediaId, patch)
    : await repo.updateMedia(shopId, productId, mediaId, patch);
  if (updated && !approved) await repo.touchProduct(shopId, productId);
  if (!updated) throw new ProductError("not_found", "media not found");
  return { ...updated, url: await media.presignRead(updated.storageKey) };
}

export async function removeMedia(shopId: string, productId: string, mediaId: string): Promise<void> {
  const approved = await isApproved(shopId, productId);
  const outcome = approved
    ? await change.deleteChangeMedia(shopId, productId, mediaId)
    : await repo.deleteMedia(shopId, productId, mediaId);
  if (outcome === "deleted" && !approved) await repo.touchProduct(shopId, productId);
  if (outcome === "not_found") throw new ProductError("not_found", "media not found");
  if (outcome === "blocked") {
    throw new ProductError("validation", "an active product must keep a primary image", [
      { field: "media", message: "cannot remove the last/primary image of an active product" },
    ]);
  }
}

const VARIANT_STATES = ["active", "inactive", "removed"] as const;

/**
 * Immediately, approved or not: stopping a sale never waits on review. One variant always stays on
 * sale. A removed variant is dropped from any pending proposal too.
 */
export async function setVariantState(
  shopId: string,
  productId: string,
  variantId: string,
  body: Record<string, unknown>,
): Promise<ProductDetail> {
  const state = body.state;
  if (typeof state !== "string" || !(VARIANT_STATES as readonly string[]).includes(state)) {
    throw new ProductError("validation", "invalid state", [{ field: "state", message: `must be one of ${VARIANT_STATES.join(", ")}` }]);
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(productId) || !UUID.test(variantId)) throw new ProductError("not_found", "variant not found");

  const outcome = await withTransaction(async (tx) => {
    const result = await writeVariantState(tx, { productId, shopId, variantId, state: state as (typeof VARIANT_STATES)[number] });
    if (result === "ok" && state === "removed") {
      await tx.query(
        `UPDATE public.product_change
            SET proposed = jsonb_set(proposed, '{variants}', COALESCE((
                  SELECT jsonb_agg(x) FROM jsonb_array_elements(proposed -> 'variants') x WHERE x ->> 'id' <> $2), '[]'::jsonb)),
                updated_at = now()
          WHERE product_id = $1 AND proposed ? 'variants'`,
        [productId, variantId],
      );
    }
    return result;
  });
  if (outcome === "not_found") throw new ProductError("not_found", "variant not found");
  if (outcome === "last_variant") {
    throw new ProductError("conflict", "this is the last size on sale — make the product unavailable instead");
  }
  if (outcome === "ok") {
    emitMetric(metricNamespace(), "VariantStateChanged", 1, { state });
    await announce([{ scope: "shop", shopId, kind: "stock" }]);
  }
  return getProduct(shopId, productId);
}

export async function getProduct(shopId: string, id: string): Promise<ProductDetail> {
  const detail = await repo.getProductDetail(shopId, id);
  if (!detail) throw new ProductError("not_found", "product not found");
  detail.media = await Promise.all(
    detail.media.map(async (m) => ({ ...m, url: await media.presignRead(m.storageKey) })),
  );
  // The pending proposal is shown beside the live product, never merged into it.
  if (detail.approved) {
    const pending = await change.readChange(shopId, id);
    if (pending) {
      const proposedMedia = pending.mediaChanged ? await change.readChangeMedia(pending.id) : null;
      detail.pendingChange = {
        state: pending.state,
        reason: pending.reason,
        submittedAt: pending.submittedAt,
        proposed: pending.proposed,
        media: proposedMedia
          ? await Promise.all(proposedMedia.map(async (m) => ({ ...m, url: await media.presignRead(m.storageKey) })))
          : null,
      };
    }
  }
  return detail;
}

async function isApproved(shopId: string, productId: string): Promise<boolean> {
  return (await repo.reviewFacts(shopId, productId))?.approved ?? false;
}

/** The same checks "publish" ran (mandatory attributes, a primary image); Effy says yes. */
export async function submitForReview(shopId: string, id: string): Promise<ProductDetail> {
  const detail = await repo.getProductDetail(shopId, id);
  if (!detail) throw new ProductError("not_found", "product not found");
  if (detail.approved) {
    throw new ProductError("conflict", "this product is already approved — changes to it are reviewed as you save them");
  }
  const fields: FieldIssue[] = detail.missingRequired.map((m) => ({
    field: "details",
    message: `missing_required_details: ${m} is required before this can be reviewed`,
  }));
  if (fields.length > 0) emitMetric(metricNamespace(), "ProductSubmitRefused", 1, { reason: "missing_required_details" });
  if (!(await repo.hasPrimaryImage(shopId, id))) {
    fields.push({ field: "media", message: "a primary image is required before this can be reviewed" });
  }
  // Every variant priced and the set valid before Effy is asked.
  const set = change.liveVariantInputs(detail);
  if (!detail.variants.some((v) => v.state === "active")) fields.push({ field: "variants", message: "at least one variant must be on sale" });
  fields.push(...validateVariantSet(set.options, set.variants, detail.unitBasis));
  if (fields.length > 0) throw new ProductError("validation", "cannot submit — missing required fields", fields);
  if (!(await repo.submitForReview(shopId, id))) throw new ProductError("not_found", "product not found");
  return getProduct(shopId, id);
}

/** Takes a submission back out of the queue or discards a pending change; the live product is untouched. */
export async function withdraw(shopId: string, id: string): Promise<ProductDetail> {
  const facts = await repo.reviewFacts(shopId, id);
  if (!facts) throw new ProductError("not_found", "product not found");
  const done = facts.approved ? await change.withdrawChange(shopId, id) : await repo.withdrawSubmission(shopId, id);
  if (!done) throw new ProductError("conflict", "there is nothing waiting for review on this product");
  return getProduct(shopId, id);
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function numericStr(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  return PRICE_RE.test(s) ? s : null;
}

/**
 * Null for "not supplied" (keep the default), never 0: a zero weight ships free and the check refuses it.
 * There is no client path to `weightIsAssumed`; it follows from supplying a weight.
 */
function normaliseWeight(raw: unknown, fields: FieldIssue[]): number | null {
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
