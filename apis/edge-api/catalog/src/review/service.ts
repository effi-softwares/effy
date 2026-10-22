// Product review — service layer (067).
//
// A reviewer sees what a shop submitted, decides, and — when approving — sets what Effy adds on top.
// This file turns rows into what a reviewer reads (a list of details, a before/after of only what
// changed) and turns a decision into one transaction.

import {
  customerPrice,
  pooled,
  presignRead,
  validateMargin,
  type Margin,
} from "@effy/edge-shared";
import {
  applyVariantSet, priceVariants, readVariantSets, VariantSetInvalid, type VariantSet,
} from "@effy/edge-shared/catalog";
import { isGstStatus, setGstStatus } from "@effy/edge-shared/documents";
import {
  REVIEW_REASON_MAX,
  UNIT_BASIS_LABELS,
  validateVariantSet,
  variantLabel,
  type OptionInputDTO,
  type ReviewVariantDTO,
  type UnitBasis,
  type VariantInputDTO,
  type MarginDTO,
  type MarginNotSetDTO,
  type ReviewDecisionDTO,
  type ReviewDetailRowDTO,
  type ReviewFieldChangeDTO,
  type ReviewImageDTO,
  type ReviewItemDetailDTO,
  type ReviewQueueDTO,
  GST_STATUS_WORDS,
} from "@effy/shared-types";

import { ReviewError } from "./errors";
import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^\d+(\.\d{1,2})?$/;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function requireProductId(id: string | undefined): string {
  if (!id || !UUID.test(id)) throw new ReviewError("not_found", "no such review item");
  return id;
}

function limitOf(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

// ── Cursors ────────────────────────────────────────────────────────────────────────────────────

/** Opaque to the client; the timestamp travels as the database's own text, never through a Date. */
function encodeCursor(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

function decodeCursor(raw: unknown, size: number): string[] | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const parts = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (Array.isArray(parts) && parts.length === size && parts.every((p) => typeof p === "string")) {
      return parts as string[];
    }
  } catch {
    /* fall through */
  }
  throw new ReviewError("validation", "the paging cursor is not valid");
}

// ── Queue ──────────────────────────────────────────────────────────────────────────────────────

export async function queue(params: Record<string, string | undefined>): Promise<ReviewQueueDTO> {
  const limit = limitOf(params.limit);
  const cursor = decodeCursor(params.cursor, 2);
  const kind = params.kind === "new_product" || params.kind === "change" ? params.kind : null;
  if (params.shopId && !UUID.test(params.shopId)) throw new ReviewError("validation", "shopId is not valid");

  const filters: Pick<repo.QueueParams, "shopId" | "kind" | "q"> = {
    shopId: params.shopId ?? null,
    kind,
    q: params.q?.trim() ? params.q.trim() : null,
  };
  // One extra row tells us whether there is a next page without a second query.
  const [rows, total] = await Promise.all([
    repo.listQueue({
      ...filters,
      afterSubmittedAt: cursor?.[0] ?? null,
      afterProductId: cursor?.[1] ?? null,
      limit: limit + 1,
    }),
    repo.countQueue(filters),
  ]);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      productId: r.product_id,
      kind: r.kind,
      shopId: r.shop_id,
      shopName: r.shop_name,
      productName: r.product_name,
      submittedAt: r.submitted_at.toISOString(),
      waitingHours: Number(r.waiting_hours),
    })),
    // ⚠ Minted from the LAST ROW RETURNED and the column the query ORDERS BY (053 shipped a cursor
    // built from a different column than the sort, and pages re-showed rows).
    nextCursor: rows.length > limit && last ? encodeCursor([last.submitted_at_text, last.product_id]) : null,
    total,
  };
}

export async function marginNotSet(params: Record<string, string | undefined>): Promise<MarginNotSetDTO> {
  const limit = limitOf(params.limit);
  const cursor = decodeCursor(params.cursor, 1);
  if (params.shopId && !UUID.test(params.shopId)) throw new ReviewError("validation", "shopId is not valid");
  const rows = await repo.listMarginNotSet(params.shopId ?? null, cursor?.[0] ?? null, limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      productId: r.product_id,
      shopId: r.shop_id,
      shopName: r.shop_name,
      productName: r.product_name,
      shopPriceAmount: r.shop_price_amount,
      status: r.status,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor([last.product_id]) : null,
  };
}

export const oldestWaitingHours = repo.oldestWaitingHours;

// ── One item ───────────────────────────────────────────────────────────────────────────────────

/** numeric(12,4) comes back as "20.0000"; a reviewer typed "20". */
function trimDecimal(v: string): string {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

function marginOf(p: repo.ProductRow): MarginDTO | null {
  return p.margin_kind && p.margin_value !== null ? { kind: p.margin_kind, value: trimDecimal(p.margin_value) } : null;
}

function attributeText(a: {
  value_text?: string | null;
  value_number?: string | number | null;
  value_boolean?: boolean | null;
  value_options?: string[] | null;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueOptions?: string[] | null;
}): string | null {
  const text = a.value_text ?? a.valueText;
  if (text !== null && text !== undefined) return text;
  const num = a.value_number ?? a.valueNumber;
  if (num !== null && num !== undefined) return trimDecimal(String(num));
  const bool = a.value_boolean ?? a.valueBoolean;
  if (bool !== null && bool !== undefined) return bool ? "Yes" : "No";
  const options = a.value_options ?? a.valueOptions;
  if (options && options.length > 0) return options.join(", ");
  return null;
}

const basisWords = (b: string | null | undefined) => (b ? (UNIT_BASIS_LABELS[b as UnitBasis] ?? b) : "None");

/** "Size: 500 g, 1 kg · Flavour: Plain, Spiced" — how a reviewer reads a set of options. */
function optionsText(options: readonly { position: number; name: string; values: readonly { value: string; position: number }[] }[]): string | null {
  if (options.length === 0) return null;
  return [...options]
    .sort((a, b) => a.position - b.position)
    .map((o) => `${o.name}: ${[...o.values].sort((a, b) => a.position - b.position).map((v) => v.value).join(", ")}`)
    .join(" · ");
}

function detailsOf(p: repo.ProductRow, attrs: repo.AttributeRow[], set: VariantSet): ReviewDetailRowDTO[] {
  return [
    { label: "Name", value: p.name },
    { label: "Short description", value: p.short_description },
    { label: "Long description", value: p.long_description },
    { label: "Brand", value: p.brand },
    { label: "Category", value: p.category_name },
    { label: "Product type", value: p.type_name },
    // 098 — prices, codes and weights are per variant, in `variants` beside these rows.
    { label: "Options", value: optionsText(set.options) ?? "None — one variant" },
    { label: "Unit pricing", value: basisWords(p.unit_basis) },
    { label: "GST", value: p.gst_status ? GST_STATUS_WORDS[p.gst_status] : "Not set" },
    ...attrs.map((a) => ({ label: a.name, value: attributeText(a) })),
  ];
}

// ── 098 — variants as a reviewer sees them ─────────────────────────────────────────────────────

type SetInput = { options: OptionInputDTO[]; variants: VariantInputDTO[] };

/** The live set (removed variants excluded) in the shape a proposal carries. */
function liveSetOf(set: VariantSet): SetInput {
  return {
    options: set.options.map((o) => ({ id: o.id, position: o.position, name: o.name, values: o.values })),
    variants: set.variants
      .filter((v) => v.state !== "removed")
      .map((v) => ({
        id: v.id, position: v.position, optionValueIds: v.optionValueIds, sku: v.sku, gtin: v.gtin,
        shopPriceAmount: v.shopPriceAmount, shopCompareAtAmount: v.shopCompareAtAmount,
        weightGrams: v.weightIsAssumed ? null : v.weightGrams, packQuantity: v.packQuantity, packUnit: v.packUnit,
        mediaStorageKey: v.mediaStorageKey,
      })),
  };
}

function proposedSetOf(proposed: Proposed): SetInput | null {
  return Array.isArray(proposed.options) && Array.isArray(proposed.variants)
    ? { options: proposed.options as OptionInputDTO[], variants: proposed.variants as VariantInputDTO[] }
    : null;
}

const moneyOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v).toFixed(2));

/** Under the margin (the shop's own price when none is set). A malformed amount shows as itself. */
function underMargin(shop: string | null | undefined, margin: Margin | null): string | null {
  if (shop === null || shop === undefined || shop === "") return null;
  return MONEY.test(shop) ? customerPrice(shop, margin) : shop;
}

const VARIANT_FIELDS: readonly { key: keyof VariantInputDTO; label: string; show: (v: VariantInputDTO) => string | null }[] = [
  { key: "shopPriceAmount", label: "Shop price", show: (v) => moneyOrNull(v.shopPriceAmount) },
  { key: "shopCompareAtAmount", label: "Shop \"was\" price", show: (v) => moneyOrNull(v.shopCompareAtAmount) },
  { key: "sku", label: "SKU", show: (v) => v.sku ?? null },
  { key: "gtin", label: "Barcode", show: (v) => v.gtin ?? null },
  { key: "weightGrams", label: "Weight (g)", show: (v) => (v.weightGrams === null || v.weightGrams === undefined ? null : String(v.weightGrams)) },
  { key: "packQuantity", label: "Pack size", show: (v) => (v.packQuantity ? `${Number(v.packQuantity)} ${v.packUnit ?? ""}`.trim() : null) },
  { key: "mediaStorageKey", label: "Picture", show: (v) => (v.mediaStorageKey ? "Own picture" : null) },
];

/**
 * Every variant the decision would make live, with what it will sell at under `margin`, and — for a
 * change — whether the change adds, removes or alters it (FR-011).
 */
function reviewVariants(live: VariantSet, target: SetInput | null, margin: Margin | null): ReviewVariantDTO[] {
  const liveSet = liveSetOf(live);
  const set = target ?? liveSet;
  const liveById = new Map(liveSet.variants.map((v) => [v.id, v]));
  const liveRows = new Map(live.variants.map((v) => [v.id, v]));
  const out: ReviewVariantDTO[] = [...set.variants]
    .sort((a, b) => a.position - b.position)
    .map((v) => {
      const was = liveById.get(v.id);
      const changed = !was ? "added" : VARIANT_FIELDS.some((f) => f.show(was) !== f.show(v)) || String(was.optionValueIds) !== String(v.optionValueIds) ? "changed" : "unchanged";
      return {
        id: v.id,
        label: variantLabel(set.options, v.optionValueIds),
        // A variant the change adds has no code until approval creates it.
        code: liveRows.get(v.id)?.code ?? null,
        sku: v.sku ?? null,
        gtin: v.gtin ?? null,
        shopPriceAmount: v.shopPriceAmount,
        shopCompareAtAmount: v.shopCompareAtAmount ?? null,
        customerPriceAmount: underMargin(v.shopPriceAmount, margin) ?? v.shopPriceAmount,
        customerCompareAtAmount: underMargin(v.shopCompareAtAmount, margin),
        weightGrams: v.weightGrams ?? liveRows.get(v.id)?.weightGrams ?? 500,
        packQuantity: v.packQuantity ?? null,
        packUnit: v.packUnit ?? null,
        state: liveRows.get(v.id)?.state ?? "active",
        change: target ? changed : "unchanged",
      };
    });
  if (target) {
    const kept = new Set(target.variants.map((v) => v.id));
    for (const v of live.variants) {
      if (v.state === "removed" || kept.has(v.id)) continue;
      out.push({
        id: v.id, label: v.label, code: v.code, sku: v.sku, gtin: v.gtin,
        shopPriceAmount: v.shopPriceAmount, shopCompareAtAmount: v.shopCompareAtAmount,
        customerPriceAmount: v.priceAmount ?? v.shopPriceAmount, customerCompareAtAmount: v.compareAtAmount,
        weightGrams: v.weightGrams, packQuantity: v.packQuantity, packUnit: v.packUnit, state: v.state, change: "removed",
      });
    }
  }
  return out;
}

/** The per-variant and option rows of a change's before/after, keyed `variant:<id>:<field>`. */
function variantChanges(live: VariantSet, target: SetInput): ReviewFieldChangeDTO[] {
  const out: ReviewFieldChangeDTO[] = [];
  const liveSet = liveSetOf(live);
  const before = optionsText(liveSet.options);
  const after = optionsText(target.options);
  if (before !== after) out.push({ field: "options", label: "Options", before, after });
  const liveById = new Map(liveSet.variants.map((v) => [v.id, v]));
  for (const v of target.variants) {
    const label = variantLabel(target.options, v.optionValueIds) ?? "The product";
    const was = liveById.get(v.id);
    if (!was) {
      out.push({ field: `variant:${v.id}`, label: `${label} — new`, before: null, after: `Shop price ${moneyOrNull(v.shopPriceAmount)}` });
      continue;
    }
    for (const f of VARIANT_FIELDS) {
      const b = f.show(was);
      const a = f.show(v);
      if (b !== a) out.push({ field: `variant:${v.id}:${String(f.key)}`, label: `${label} — ${f.label}`, before: b, after: a });
    }
  }
  const kept = new Set(target.variants.map((v) => v.id));
  for (const v of liveSet.variants) {
    if (!kept.has(v.id)) out.push({ field: `variant:${v.id}`, label: `${variantLabel(liveSet.options, v.optionValueIds) ?? "The product"} — removed`, before: "Sold", after: null });
  }
  return out;
}

/** Whether a change moves any shop price (a new variant has one): the margin must then be confirmed (FR-031). */
function changesShopPrices(live: VariantSet, target: SetInput | null): boolean {
  if (!target) return false;
  const liveById = new Map(liveSetOf(live).variants.map((v) => [v.id, v]));
  return target.variants.some((v) => {
    const was = liveById.get(v.id);
    return !was || moneyOrNull(was.shopPriceAmount) !== moneyOrNull(v.shopPriceAmount) || moneyOrNull(was.shopCompareAtAmount) !== moneyOrNull(v.shopCompareAtAmount);
  });
}

async function images(rows: repo.MediaRow[], liveKeys: Set<string> | null): Promise<ReviewImageDTO[]> {
  return Promise.all(
    rows.map(async (m) => ({
      url: await presignRead(m.storage_key),
      isPrimary: m.is_primary,
      altText: m.alt_text,
      // "New" = this change adds it. Judged by the OBJECT, so re-registering a live image is not new.
      isNew: liveKeys !== null && !liveKeys.has(m.storage_key),
    })),
  );
}

type Proposed = {
  name?: unknown;
  shortDescription?: unknown;
  longDescription?: unknown;
  brand?: unknown;
  primaryCategoryId?: unknown;
  productTypeId?: unknown;
  gstStatus?: unknown;
  attributes?: unknown;
  /** 098 */
  unitBasis?: unknown;
  options?: unknown;
  variants?: unknown;
};

interface ProposedAttribute {
  attributeId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueOptions?: string[] | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function proposedAttributes(p: Proposed): ProposedAttribute[] {
  if (!Array.isArray(p.attributes)) return [];
  return (p.attributes as unknown[]).filter(
    (a): a is ProposedAttribute => typeof a === "object" && a !== null && UUID.test(String((a as { attributeId?: unknown }).attributeId)),
  );
}

/** Only what the shop is asking to change, in the words a reviewer reads (FR-010). */
async function changesOf(
  p: repo.ProductRow,
  attrs: repo.AttributeRow[],
  proposed: Proposed,
  live: VariantSet,
): Promise<ReviewFieldChangeDTO[]> {
  const pAttrs = proposedAttributes(proposed);
  const names = await repo.namesFor(
    str(proposed.productTypeId) ? [str(proposed.productTypeId)!] : [],
    str(proposed.primaryCategoryId) ? [str(proposed.primaryCategoryId)!] : [],
    pAttrs.map((a) => a.attributeId),
  );
  const out: ReviewFieldChangeDTO[] = [];
  const add = (field: string, label: string, before: string | null, after: string | null) =>
    out.push({ field, label, before, after });

  if ("name" in proposed) add("name", "Name", p.name, str(proposed.name));
  if ("shortDescription" in proposed) add("shortDescription", "Short description", p.short_description, str(proposed.shortDescription));
  if ("longDescription" in proposed) add("longDescription", "Long description", p.long_description, str(proposed.longDescription));
  if ("brand" in proposed) add("brand", "Brand", p.brand, str(proposed.brand));
  if ("primaryCategoryId" in proposed) {
    const c = names.categories.get(String(proposed.primaryCategoryId));
    add("primaryCategoryId", "Category", p.category_name, c?.name ?? null);
  }
  if ("productTypeId" in proposed) {
    const t = names.types.get(String(proposed.productTypeId));
    add("productTypeId", "Product type", p.type_name, t?.name ?? null);
  }
  if ("unitBasis" in proposed) add("unitBasis", "Unit pricing", basisWords(p.unit_basis), basisWords(str(proposed.unitBasis)));
  // 098 — sizes added, removed or changed, and the options they are chosen by.
  const target = proposedSetOf(proposed);
  if (target) out.push(...variantChanges(live, target));
  // 096 — the shop's GST status for a live product is reviewed like every other detail.
  if ("gstStatus" in proposed && isGstStatus(proposed.gstStatus)) {
    add("gstStatus", "GST", p.gst_status ? GST_STATUS_WORDS[p.gst_status] : "Not set", GST_STATUS_WORDS[proposed.gstStatus]);
  }

  const liveAttrs = new Map(attrs.map((a) => [a.attribute_definition_id, a]));
  for (const a of pAttrs) {
    const def = names.attributes.get(a.attributeId);
    const was = liveAttrs.get(a.attributeId);
    add(`attribute:${def?.key ?? a.attributeId}`, def?.name ?? "Attribute", was ? attributeText(was) : null, attributeText(a));
  }
  return out;
}

export async function item(rawProductId: string | undefined): Promise<ReviewItemDetailDTO> {
  const productId = requireProductId(rawProductId);
  const p = await repo.readProduct(productId);
  if (!p) throw new ReviewError("not_found", "no such review item");

  const [attrs, liveMedia, sets] = await Promise.all([
    repo.readAttributes(productId), repo.readLiveMedia(productId), readVariantSets(pooled, [productId]),
  ]);
  const live = sets.get(productId)!;
  const shop = { id: p.shop_id, name: p.shop_name, status: p.shop_status };

  if (!p.approved) {
    if (p.review_state !== "in_review" || !p.submitted_at) {
      throw new ReviewError("not_found", "this product is not waiting for review");
    }
    return {
      productId,
      kind: "new_product",
      version: p.version,
      shop,
      submittedAt: p.submitted_at.toISOString(),
      productName: p.name,
      details: detailsOf(p, attrs, live),
      changes: [],
      images: { current: await images(liveMedia, null), proposed: null },
      // Under no margin yet: the reviewer's margin input recomputes these as they type.
      variants: reviewVariants(live, null, null),
      currentMargin: null,
      marginRequired: true,
    };
  }

  const change = await repo.readChange(productId);
  if (!change || change.state !== "in_review") {
    throw new ReviewError("not_found", "this product has no change waiting for review");
  }
  const proposed = change.proposed as Proposed;
  const liveKeys = new Set(liveMedia.map((m) => m.storage_key));
  const proposedMedia = change.media_changed ? await repo.readChangeMedia(change.id) : null;
  const target = proposedSetOf(proposed);
  const priceChanges = changesShopPrices(live, target);

  return {
    productId,
    kind: "change",
    version: change.version,
    shop,
    submittedAt: change.submitted_at.toISOString(),
    productName: p.name,
    details: detailsOf(p, attrs, live),
    changes: await changesOf(p, attrs, proposed, live),
    images: {
      current: await images(liveMedia, null),
      proposed: proposedMedia ? await images(proposedMedia, liveKeys) : null,
    },
    variants: reviewVariants(live, target, marginOf(p)),
    currentMargin: marginOf(p),
    marginRequired: priceChanges || p.margin_kind === null,
  };
}

// ── Decisions ──────────────────────────────────────────────────────────────────────────────────

const STALE = "this item changed, or was already decided — reload it and look again";

function requireVersion(v: unknown): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new ReviewError("validation", "version is required", [{ field: "version", message: "is required" }]);
  }
  return v;
}

function requireMargin(input: unknown): Margin {
  const out = validateMargin(input);
  if (!out.ok) {
    const message =
      out.reason === "negative"
        ? "a margin cannot be negative"
        : out.reason === "too_large"
          ? "that margin is too large to be intended"
          : "enter a margin as a percentage or an amount";
    throw new ReviewError("validation", message, [{ field: "margin", message }]);
  }
  return out.margin;
}

const marginWrite = (margin: Margin | null): repo.MarginWrite => ({ marginKind: margin?.kind ?? null, marginValue: margin?.value ?? null });

/**
 * 098 — every live variant's prices after a decision. The customer prices were written by
 * `priceVariants` (lib/margin.ts is the arithmetic); ⚠ FR-035 — the "was" price carries the SAME
 * margin, so "was 12, now 10" never becomes "was 12, now 12" once Effy adds 20%.
 */
async function decidedVariants(tx: Parameters<typeof readVariantSets>[0], productId: string): Promise<ReviewDecisionDTO["variants"]> {
  const set = (await readVariantSets(tx, [productId], { states: ["active", "inactive"] })).get(productId)!;
  return set.variants.map((v) => ({ id: v.id, label: v.label, shopPriceAmount: v.shopPriceAmount, customerPriceAmount: v.priceAmount ?? v.shopPriceAmount }));
}

/** A set the one writer refused at approval — the shop must change it, so it goes back. */
function asReviewError(err: unknown): never {
  if (err instanceof VariantSetInvalid) {
    throw new ReviewError("validation", "the proposed sizes are no longer valid — send this back", err.errors);
  }
  throw err;
}

const marginDetail = (m: Margin | MarginDTO | null) => (m ? { kind: m.kind, value: m.value } : null);

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function approve(
  rawProductId: string | undefined,
  body: { version?: unknown; margin?: unknown },
  actorSub: string,
): Promise<ReviewDecisionDTO> {
  const productId = requireProductId(rawProductId);
  const version = requireVersion(body.version);

  try {
    return await repo.withTransaction(async (tx) => {
      const p = await repo.readProduct(productId, tx, true);
      if (!p) throw new ReviewError("not_found", "no such review item");

      // ── A new product ──
      if (!p.approved) {
        if (p.review_state !== "in_review" || p.version !== version) throw new ReviewError("conflict", STALE);
        // FR-028 — no approval without a margin. Zero is a margin; absent is not.
        const margin = requireMargin(body.margin);
        if (!(await repo.approveNewProduct(tx, productId, version, marginWrite(margin)))) throw new ReviewError("conflict", STALE);
        // 098 — the ONE margin prices EVERY variant (R7).
        await priceVariants(tx, productId, margin);
        const variants = await decidedVariants(tx, productId);

        await repo.audit(tx, actorSub, "product.approved", productId, {
          shopId: p.shop_id,
          variants: variants.map((v) => ({ id: v.id, shopPriceAmount: v.shopPriceAmount, customerPriceAmount: v.customerPriceAmount })),
          marginBefore: null,
          marginAfter: marginDetail(margin),
        });
        await repo.notifyShop(tx, "shop_product_approved", p.shop_id, productId, `${productId}:${version}`);
        return { productId, margin, variants };
      }

      // ── A change to a live product ──
      const change = await repo.readChange(productId, tx, true);
      if (!change || change.state !== "in_review" || change.version !== version) {
        throw new ReviewError("conflict", STALE);
      }
      const proposed = change.proposed as Proposed;
      const pAttrs = proposedAttributes(proposed);

      const names = await repo.namesFor(
        str(proposed.productTypeId) ? [str(proposed.productTypeId)!] : [],
        str(proposed.primaryCategoryId) ? [str(proposed.primaryCategoryId)!] : [],
        [],
        tx,
      );
      // A category or type Effy retired AFTER the shop proposed it cannot become live.
      if ("primaryCategoryId" in proposed && names.categories.get(String(proposed.primaryCategoryId))?.status !== "active") {
        throw new ReviewError("validation", "the proposed category is no longer available — send this back");
      }
      if ("productTypeId" in proposed && names.types.get(String(proposed.productTypeId))?.status !== "active") {
        throw new ReviewError("validation", "the proposed product type is no longer available — send this back");
      }

      const live = (await readVariantSets(tx, [productId])).get(productId)!;
      const target = proposedSetOf(proposed);
      const current = marginOf(p);
      // FR-031 — a new shop price (or a new variant) reopens the margin; so does a product that never had one.
      const marginRequired = changesShopPrices(live, target) || current === null;
      const supplied = body.margin !== undefined && body.margin !== null;
      if (marginRequired && !supplied) {
        const message = "confirm the margin — the shop's price is changing, or none has been set";
        throw new ReviewError("validation", message, [{ field: "margin", message }]);
      }
      const margin = supplied ? requireMargin(body.margin) : current;
      const unitBasis = "unitBasis" in proposed ? (str(proposed.unitBasis) as UnitBasis | null) : (p.unit_basis as UnitBasis | null);

      await repo.applyChange(
        tx,
        productId,
        change.id,
        {
          name: str(proposed.name) ?? p.name,
          brand: "brand" in proposed ? str(proposed.brand) : p.brand,
          shortDescription: str(proposed.shortDescription) ?? p.short_description,
          longDescription: "longDescription" in proposed ? str(proposed.longDescription) : p.long_description,
          productTypeId: str(proposed.productTypeId) ?? p.product_type_id,
          primaryCategoryId: str(proposed.primaryCategoryId) ?? p.primary_category_id,
          unitBasis,
        },
        marginWrite(margin),
        pAttrs.map((a) => ({
          attributeId: a.attributeId,
          valueText: a.valueText ?? null,
          valueNumber: a.valueNumber ?? null,
          valueBoolean: a.valueBoolean ?? null,
          valueOptions: a.valueOptions ?? null,
        })),
        change.media_changed,
      );
      // 096 — through the one writer, recorded as approved in review.
      if (isGstStatus(proposed.gstStatus)) {
        await setGstStatus(tx, productId, proposed.gstStatus, { kind: "admin_staff", sub: actorSub }, "review");
      }
      // 098 — the proposed sizes become the live ones through the ONE writer (after the images, which
      // a variant may name); a variant the proposal drops is REMOVED, kept for history. A basis that
      // changed alone is checked against the sizes as they are.
      if (target) {
        await applyVariantSet(tx, { productId, shopId: p.shop_id, options: target.options, variants: target.variants, unitBasis, mode: "live" }).catch(asReviewError);
      } else if ("unitBasis" in proposed) {
        const errors = validateVariantSet(liveSetOf(live).options, liveSetOf(live).variants, unitBasis);
        if (errors.length > 0) throw new ReviewError("validation", "the proposed unit pricing does not fit the sizes — send this back", errors);
      }
      // 098 — the ONE margin prices EVERY variant (R7), new ones included.
      await priceVariants(tx, productId, margin);
      const variants = await decidedVariants(tx, productId);

      await repo.audit(tx, actorSub, "product.change_approved", productId, {
        shopId: p.shop_id,
        // WHICH details changed, never their values: a description is not audit data, and the
        // prices after are carried explicitly below.
        changed: [...Object.keys(proposed).filter((k) => k !== "attributes"), ...(pAttrs.length ? ["attributes"] : []), ...(change.media_changed ? ["images"] : [])].sort(),
        variants: variants.map((v) => ({ id: v.id, shopPriceAmount: v.shopPriceAmount, customerPriceAmount: v.customerPriceAmount })),
        marginBefore: marginDetail(current),
        marginAfter: marginDetail(margin),
      });
      await repo.notifyShop(tx, "shop_product_approved", p.shop_id, productId, `${productId}:${version}`);
      return { productId, margin, variants };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ReviewError("conflict", "another product at this shop already uses the proposed SKU — send this back");
    }
    throw err;
  }
}

export async function sendBack(
  rawProductId: string | undefined,
  body: { version?: unknown; reason?: unknown },
  actorSub: string,
): Promise<{ productId: string }> {
  const productId = requireProductId(rawProductId);
  const version = requireVersion(body.version);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  // FR-012 — a refusal with no reason leaves the shop guessing.
  if (reason === "" || Array.from(reason).length > REVIEW_REASON_MAX) {
    const message = reason === "" ? "say why this is being sent back" : `keep the reason under ${REVIEW_REASON_MAX} characters`;
    throw new ReviewError("validation", message, [{ field: "reason", message }]);
  }

  return repo.withTransaction(async (tx) => {
    const p = await repo.readProduct(productId, tx, true);
    if (!p) throw new ReviewError("not_found", "no such review item");

    const isChange = p.approved;
    const ok = isChange
      ? await repo.sendBackChange(tx, productId, version, reason)
      : await repo.sendBackNewProduct(tx, productId, version, reason);
    if (!ok) throw new ReviewError("conflict", STALE);

    await repo.audit(tx, actorSub, isChange ? "product.change_sent_back" : "product.sent_back", productId, {
      shopId: p.shop_id,
      reason,
    });
    await repo.notifyShop(tx, "shop_product_sent_back", p.shop_id, productId, `${productId}:${version}`);
    return { productId };
  });
}

/**
 * Set or change Effy's margin on a product that is already approved (FR-032).
 *
 * The customer price follows at once. ⚠ The shop is NOT notified: this is Effy's own number, and a
 * push saying "your margin changed" would publish the very figure FR-039 keeps from them.
 */
export async function setMargin(
  rawProductId: string | undefined,
  body: { margin?: unknown; expectedCurrent?: unknown },
  actorSub: string,
): Promise<ReviewDecisionDTO> {
  const productId = requireProductId(rawProductId);
  const margin = requireMargin(body.margin);
  const expected =
    body.expectedCurrent === null || body.expectedCurrent === undefined ? null : requireMargin(body.expectedCurrent);

  return repo.withTransaction(async (tx) => {
    const p = await repo.readProduct(productId, tx, true);
    if (!p) throw new ReviewError("not_found", "no such product");
    if (!p.approved) {
      throw new ReviewError("conflict", "this product has not been approved — set its margin when approving it");
    }
    const before = await decidedVariants(tx, productId);
    const ok = await repo.setMargin(tx, productId, { kind: expected?.kind ?? null, value: expected?.value ?? null }, marginWrite(margin));
    if (!ok) throw new ReviewError("conflict", "the margin was changed by someone else — reload and look again");
    // 098 — the customer price of EVERY variant follows at once.
    await priceVariants(tx, productId, margin);
    const variants = await decidedVariants(tx, productId);

    await repo.audit(tx, actorSub, "product.margin_set", productId, {
      shopId: p.shop_id,
      customerPricesBefore: before.map((v) => ({ id: v.id, customerPriceAmount: v.customerPriceAmount })),
      customerPricesAfter: variants.map((v) => ({ id: v.id, customerPriceAmount: v.customerPriceAmount })),
      marginBefore: marginDetail(marginOf(p)),
      marginAfter: marginDetail(margin),
    });
    return { productId, margin, variants };
  });
}
