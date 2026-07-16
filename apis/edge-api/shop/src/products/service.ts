// Service layer for the shop product catalog (016) — validation, EAV attribute typing, and the S3
// presign boundary (keys → short-lived urls). No HTTP and no SQL (Principle VI). Dependencies wired
// by explicit module import (no DI framework); tests mock ./repository and ./media at the module
// boundary. `shopId` is always the caller-resolved actor shop — never client input.
import * as media from "./media";
import * as repo from "./repository";
import {
  type CatalogSchema,
  type CreateProductInput,
  type FieldIssue,
  type ListParams,
  type Paged,
  type ProductDetail,
  ProductError,
  type ProductListItem,
  PRODUCT_STATUSES,
  type ProductStatus,
  type SchemaAttribute,
} from "./types";

const PRICE_RE = /^\d+(\.\d{1,2})?$/;
const SORTS = ["name", "price", "recent"] as const;

// ── Schema-read ───────────────────────────────────────────────────────────────────────────────

export function getCatalogSchema(): Promise<CatalogSchema> {
  return repo.readCatalogSchema();
}

// ── Value parsing / typing helpers ──────────────────────────────────────────────────────────────

function parsePrice(value: unknown, field: string, fields: FieldIssue[]): string | null {
  const s = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!PRICE_RE.test(s) || Number(s) < 0) {
    fields.push({ field, message: "must be a non-negative amount with up to 2 decimals" });
    return null;
  }
  return s;
}

function optText(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** Return the trimmed value if a non-empty string, else push a field error and return null. */
function requireNonEmpty(value: unknown, field: string, fields: FieldIssue[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    fields.push({ field, message: "must be a non-empty string" });
    return null;
  }
  return value.trim();
}

/** Validate one supplied attribute value against its schema data type, returning the normalised
 *  (single-column) value or pushing a field error. */
function normaliseAttribute(
  raw: { attributeId?: unknown; valueText?: unknown; valueNumber?: unknown; valueBoolean?: unknown; valueOptions?: unknown },
  schema: Map<string, SchemaAttribute>,
  fields: FieldIssue[],
): CreateProductInput["attributes"][number] | null {
  const attributeId = typeof raw.attributeId === "string" ? raw.attributeId : "";
  const def = schema.get(attributeId);
  if (!def) {
    fields.push({ field: "attributes", message: `unknown attribute ${attributeId || "(missing id)"}` });
    return null;
  }
  const f = `attributes.${def.key}`;
  const empty = { attributeId, valueText: null, valueNumber: null, valueBoolean: null, valueOptions: null };
  switch (def.dataType) {
    case "short_text":
    case "long_text": {
      const t = optText(raw.valueText);
      if (t === null) return failMissing(f, fields, def);
      if (def.validation?.maxLength && t.length > def.validation.maxLength) {
        fields.push({ field: f, message: `must be at most ${def.validation.maxLength} characters` });
        return null;
      }
      return { ...empty, valueText: t };
    }
    case "number": {
      const n = typeof raw.valueNumber === "number" ? raw.valueNumber : Number(raw.valueNumber);
      if (!Number.isFinite(n)) return failMissing(f, fields, def);
      if (def.validation?.min != null && n < def.validation.min) {
        fields.push({ field: f, message: `must be ≥ ${def.validation.min}` });
        return null;
      }
      if (def.validation?.max != null && n > def.validation.max) {
        fields.push({ field: f, message: `must be ≤ ${def.validation.max}` });
        return null;
      }
      return { ...empty, valueNumber: n };
    }
    case "boolean": {
      if (typeof raw.valueBoolean !== "boolean") return failMissing(f, fields, def);
      return { ...empty, valueBoolean: raw.valueBoolean };
    }
    case "single_select": {
      const t = optText(raw.valueText);
      if (t === null) return failMissing(f, fields, def);
      if (!def.allowedValues.some((a) => a.value === t)) {
        fields.push({ field: f, message: "not an allowed value" });
        return null;
      }
      return { ...empty, valueText: t };
    }
    case "multi_select": {
      if (!Array.isArray(raw.valueOptions) || raw.valueOptions.some((o) => typeof o !== "string")) {
        return failMissing(f, fields, def);
      }
      const opts = raw.valueOptions as string[];
      const allowed = new Set(def.allowedValues.map((a) => a.value));
      if (opts.some((o) => !allowed.has(o))) {
        fields.push({ field: f, message: "contains a value that is not allowed" });
        return null;
      }
      return { ...empty, valueOptions: opts };
    }
  }
}

function failMissing(field: string, fields: FieldIssue[], def: SchemaAttribute): null {
  fields.push({ field, message: `${def.name} has a value of the wrong type or is empty` });
  return null;
}

// ── Create ────────────────────────────────────────────────────────────────────────────────────

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

  const productTypeId = typeof body.productTypeId === "string" ? body.productTypeId : "";
  const primaryCategoryId = typeof body.primaryCategoryId === "string" ? body.primaryCategoryId : "";
  if (!productTypeId) fields.push({ field: "productTypeId", message: "is required" });
  if (!primaryCategoryId) fields.push({ field: "primaryCategoryId", message: "is required" });

  const priceAmount = parsePrice(body.priceAmount, "priceAmount", fields);
  const compareAtAmount =
    body.compareAtAmount === undefined || body.compareAtAmount === null
      ? null
      : parsePrice(body.compareAtAmount, "compareAtAmount", fields);

  // Media at create is OPTIONAL — a product is created as a DRAFT and its image is attached
  // immediately after (the presign endpoint needs the product id first). The primary-image and
  // type-mandatory-completeness requirements (FR-010) are enforced at PUBLISH (draft → active,
  // data-model §4), via assertPublishable. If media IS supplied here, exactly one must be primary.
  const mediaInput = normaliseMedia(body.media, body.primaryMediaStorageKey, fields);

  // Type must be active; category must be active.
  if (productTypeId && !(await repo.productTypeIsActive(productTypeId))) {
    fields.push({ field: "productTypeId", message: "is not an active product type" });
  }
  if (primaryCategoryId && !(await repo.categoryIsActive(primaryCategoryId))) {
    fields.push({ field: "primaryCategoryId", message: "is not an active category" });
  }

  // Attribute typing: any provided value must match its schema data type (mandatory-completeness is
  // a publish-time check, not a create-time one — a draft may be partial).
  const schemaAttrs = productTypeId ? await repo.assignmentsForType(productTypeId) : [];
  const schemaMap = new Map(schemaAttrs.map((a) => [a.attributeId, a]));
  const rawAttrs = Array.isArray(body.attributes) ? (body.attributes as Record<string, unknown>[]) : [];
  const attributes: CreateProductInput["attributes"] = [];
  for (const raw of rawAttrs) {
    const norm = normaliseAttribute(raw, schemaMap, fields);
    if (norm) attributes.push(norm);
  }

  if (fields.length > 0) throw new ProductError("validation", "invalid product", fields);

  const input: CreateProductInput = {
    productTypeId,
    primaryCategoryId,
    name: name!,
    sku: optText(body.sku),
    gtin: optText(body.gtin),
    brand: optText(body.brand), // first-class column (FR-010a) — never an attribute
    priceAmount: priceAmount!,
    compareAtAmount,
    shortDescription: shortDescription!,
    longDescription: optText(body.longDescription),
    attributes,
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
  // A single `primaryMediaStorageKey` shorthand (create flow uploads one image then submits).
  if (typeof primaryKey === "string" && primaryKey.length > 0 && !list.some((m) => m.storageKey === primaryKey)) {
    list.push({ storageKey: primaryKey, isPrimary: true, altText: null, displayOrder: 0 });
  }
  if (list.length === 0) return list; // a draft may have no image yet (attached after create)
  // Exactly one primary — default the first if none flagged, reject if more than one.
  const primaries = list.filter((m) => m.isPrimary);
  if (primaries.length === 0) list[0]!.isPrimary = true;
  else if (primaries.length > 1) fields.push({ field: "media", message: "only one image can be primary" });
  return list;
}

// ── Media (presign + register; shop-scoped ownership) ──────────────────────────────────────────

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
  const registered = await repo.registerMedia(productId, {
    storageKey,
    isPrimary: body.isPrimary === true,
    altText: optText(body.altText),
    displayOrder: typeof body.displayOrder === "number" ? Math.floor(body.displayOrder) : 0,
  });
  // Return with a presigned GET url (the stored `url` is the key).
  return { ...registered, url: await media.presignRead(registered.storageKey) };
}

// ── List ──────────────────────────────────────────────────────────────────────────────────────

export async function listProducts(
  shopId: string,
  params: {
    page?: unknown;
    pageSize?: unknown;
    q?: unknown;
    type?: unknown;
    category?: unknown;
    section?: unknown;
    status?: unknown;
    priceMin?: unknown;
    priceMax?: unknown;
    sort?: unknown;
    order?: unknown;
  },
): Promise<Paged<ProductListItem>> {
  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(toPositiveInt(params.pageSize, 20), 100); // clamp ≤100 (FR-017/R7)
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
    type: optText(params.type),
    category: optText(params.category),
    section: optText(params.section),
    status,
    priceMin: numericStr(params.priceMin),
    priceMax: numericStr(params.priceMax),
    sort,
    order,
  };
  const paged = await repo.listProducts(shopId, clean);
  // Replace each primary-image STORAGE KEY with a short-lived presigned GET url.
  const items = await Promise.all(
    paged.items.map(async (item) => ({
      ...item,
      primaryImageUrl: item.primaryImageUrl ? await media.presignRead(item.primaryImageUrl) : null,
    })),
  );
  return { ...paged, items };
}

// ── Focused edit (optimistic concurrency, FR-023a) ─────────────────────────────────────────────

export async function updateProduct(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<ProductDetail> {
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!expectedUpdatedAt) {
    throw new ProductError("validation", "invalid update", [
      { field: "expectedUpdatedAt", message: "is required (optimistic concurrency token)" },
    ]);
  }
  const current = await repo.getProductDetail(shopId, id);
  if (!current) throw new ProductError("not_found", "product not found");

  const fields: FieldIssue[] = [];
  // Merge each supplied field over the current value (a focused edit patches a subset).
  const name = "name" in body ? requireNonEmpty(body.name, "name", fields) ?? current.name : current.name;
  const shortDescription =
    "shortDescription" in body ? requireNonEmpty(body.shortDescription, "shortDescription", fields) ?? current.shortDescription : current.shortDescription;
  const productTypeId = "productTypeId" in body && typeof body.productTypeId === "string" ? body.productTypeId : current.productTypeId;
  const primaryCategoryId = "primaryCategoryId" in body && typeof body.primaryCategoryId === "string" ? body.primaryCategoryId : current.primaryCategoryId;
  const priceAmount = "priceAmount" in body ? parsePrice(body.priceAmount, "priceAmount", fields) ?? current.priceAmount : current.priceAmount;
  const compareAtAmount =
    "compareAtAmount" in body
      ? body.compareAtAmount === null
        ? null
        : parsePrice(body.compareAtAmount, "compareAtAmount", fields)
      : current.compareAtAmount;

  if (productTypeId !== current.productTypeId && !(await repo.productTypeIsActive(productTypeId))) {
    fields.push({ field: "productTypeId", message: "is not an active product type" });
  }
  if (primaryCategoryId !== current.primaryCategoryId && !(await repo.categoryIsActive(primaryCategoryId))) {
    fields.push({ field: "primaryCategoryId", message: "is not an active category" });
  }

  // Provided attribute values are re-typed against the (possibly new) type's schema; a mandatory
  // attribute supplied with an invalid/empty value is rejected (mandatory cannot be cleared, FR-024).
  const schemaAttrs = await repo.assignmentsForType(productTypeId);
  const schemaMap = new Map(schemaAttrs.map((a) => [a.attributeId, a]));
  const rawAttrs = Array.isArray(body.attributes) ? (body.attributes as Record<string, unknown>[]) : [];
  const attributes: CreateProductInput["attributes"] = [];
  for (const raw of rawAttrs) {
    const norm = normaliseAttribute(raw, schemaMap, fields);
    if (norm) attributes.push(norm);
  }

  if (fields.length > 0) throw new ProductError("validation", "invalid update", fields);

  const outcome = await repo.updateProduct(
    shopId,
    id,
    expectedUpdatedAt,
    {
      name,
      productTypeId,
      primaryCategoryId,
      sku: "sku" in body ? optText(body.sku) : current.sku,
      gtin: "gtin" in body ? optText(body.gtin) : current.gtin,
      brand: "brand" in body ? optText(body.brand) : current.brand,
      priceAmount,
      compareAtAmount,
      shortDescription,
      longDescription: "longDescription" in body ? optText(body.longDescription) : current.longDescription,
    },
    attributes,
  );
  if (outcome === "stale") {
    throw new ProductError("conflict", "product changed since you loaded it — reload and try again");
  }
  return getProduct(shopId, id);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────────────────────

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
  // Publishing (→ active) re-validates ALL mandatory fields: every type-mandatory attribute present
  // AND a primary image (FR-010, data-model §4). This is the enforcement point create defers.
  if (status === "active") {
    const detail = await repo.getProductDetail(shopId, id);
    if (!detail) throw new ProductError("not_found", "product not found");
    const missing = detail.missingMandatoryAttributes;
    const fields: FieldIssue[] = missing.map((m) => ({ field: "attributes", message: `${m} is required to publish` }));
    if (!(await repo.hasPrimaryImage(shopId, id))) {
      fields.push({ field: "media", message: "a primary image is required to publish" });
    }
    if (fields.length > 0) throw new ProductError("validation", "cannot publish — missing required fields", fields);
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
  const updated = await repo.updateMedia(shopId, productId, mediaId, {
    isPrimary: typeof body.isPrimary === "boolean" ? body.isPrimary : undefined,
    displayOrder: typeof body.displayOrder === "number" ? Math.floor(body.displayOrder) : undefined,
    altText: "altText" in body ? optText(body.altText) : undefined,
  });
  if (!updated) throw new ProductError("not_found", "media not found");
  return { ...updated, url: await media.presignRead(updated.storageKey) };
}

export async function removeMedia(shopId: string, productId: string, mediaId: string): Promise<void> {
  const outcome = await repo.deleteMedia(shopId, productId, mediaId);
  if (outcome === "not_found") throw new ProductError("not_found", "media not found");
  if (outcome === "blocked") {
    throw new ProductError("validation", "an active product must keep a primary image", [
      { field: "media", message: "cannot remove the last/primary image of an active product" },
    ]);
  }
}

// ── Detail ────────────────────────────────────────────────────────────────────────────────────

export async function getProduct(shopId: string, id: string): Promise<ProductDetail> {
  const detail = await repo.getProductDetail(shopId, id);
  if (!detail) throw new ProductError("not_found", "product not found");
  // Replace each media STORAGE KEY (currently in `url`) with a short-lived presigned GET url.
  detail.media = await Promise.all(
    detail.media.map(async (m) => ({ ...m, url: await media.presignRead(m.storageKey) })),
  );
  return detail;
}

// ── small helpers ───────────────────────────────────────────────────────────────────────────────

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function numericStr(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  return PRICE_RE.test(s) ? s : null;
}
