import {
  offsetListPage,
  customerPrice,
  pooled,
  imageUrlOrNull,
  presignRead,
  validateMargin,
  type Margin,
} from "@effy/edge-shared";
import {
  applyVariantSet, DetailsInvalid, missingRequired, priceVariants, readFormRows, readProductDetails, readVariantSets,
  reconcileDetails, VariantSetInvalid, writeProductDetails, type VariantSet,
} from "@effy/edge-shared/catalog";
import { isGstStatus, setGstStatus } from "@effy/edge-shared/documents";
import {
  formatAttributeValue,
  GST_STATUS_WORDS,
  REVIEW_REASON_MAX,
  STORAGE_WORDS,
  UNIT_BASIS_LABELS,
  validateVariantSet,
  variantLabel,
  type CategoryFormRow,
  type DetailInput,
  type FactKey,
  type OptionInputDTO,
  type ReviewVariantDTO,
  type Storage,
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
} from "@effy/shared-types";

import { ReviewError } from "./errors";
import type { MarginNotSetRequest, ReviewQueueRequest } from "./list";
import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^\d+(\.\d{1,2})?$/;


function requireProductId(id: string | undefined): string {
  if (!id || !UUID.test(id)) throw new ReviewError("not_found", "no such review item");
  return id;
}


/** A change's proposed fields, as the queue row names them; sizes and their prices are one thing to a reviewer. */
const PROPOSAL_WORDS: Record<string, string> = {
  name: "Name",
  brand: "Brand",
  shortDescription: "Short description",
  longDescription: "Long description",
  primaryCategoryId: "Category",
  gstStatus: "GST",
  storage: "Storage",
  ageRestricted: "18+",
  details: "Details",
  unitBasis: "Unit pricing",
  options: "Sizes and prices",
  variants: "Sizes and prices",
};

export function changeWords(keys: readonly string[] | null, mediaChanged: boolean): string[] {
  const words = (keys ?? []).map((k) => PROPOSAL_WORDS[k]).filter((w): w is string => !!w);
  if (mediaChanged) words.push("Pictures");
  return [...new Set(words)];
}

export async function queue(req: ReviewQueueRequest): Promise<ReviewQueueDTO> {
  const r = await repo.listQueue(req);
  return offsetListPage(
    await Promise.all(
      r.rows.map(async (x) => ({
        productId: x.product_id,
        kind: x.kind,
        shopId: x.shop_id,
        shopName: x.shop_name,
        productName: x.product_name,
        submittedAt: x.submitted_at.toISOString(),
        waitingHours: Number(x.waiting_hours),
        // Presigned like the item's pictures: a submission's may not be public yet.
        imageUrl: await imageUrlOrNull(x.image_key),
        sizeCount: Number(x.size_count),
        changes: x.kind === "change" ? changeWords(x.change_keys, x.media_changed) : [],
      })),
    ),
    req,
    r,
  );
}

export const queueViewCounts = (req: ReviewQueueRequest) => repo.queueViewCounts(req);

export async function marginNotSet(req: MarginNotSetRequest): Promise<MarginNotSetDTO> {
  const r = await repo.listMarginNotSet(req);
  return offsetListPage(
    r.rows.map((x) => ({
      productId: x.product_id,
      shopId: x.shop_id,
      shopName: x.shop_name,
      productName: x.product_name,
      shopPriceAmount: x.shop_price_amount,
      status: x.status,
      approvedAt: x.approved_at.toISOString(),
    })),
    req,
    r,
  );
}

export const oldestWaitingHours = repo.oldestWaitingHours;

/** numeric(12,4) comes back as "20.0000"; a reviewer typed "20". */
function trimDecimal(v: string): string {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

function marginOf(p: repo.ProductRow): MarginDTO | null {
  return p.margin_kind && p.margin_value !== null ? { kind: p.margin_kind, value: trimDecimal(p.margin_value) } : null;
}

const basisWords = (b: string | null | undefined) => (b ? (UNIT_BASIS_LABELS[b as UnitBasis] ?? b) : "None");

/** "Colour: Red, Blue · Flavour: Plain, Mango" — how a reviewer reads a set of options. */
function optionsText(options: readonly LabelledOption[]): string | null {
  if (options.length === 0) return null;
  return [...options]
    .sort((a, b) => a.position - b.position)
    .map((o) => `${o.name}: ${[...o.values].sort((a, b) => a.position - b.position).map((v) => v.value).join(", ")}`)
    .join(" · ");
}

type SetInput = { options: OptionInputDTO[]; variants: VariantInputDTO[] };

interface LabelledOption {
  position: number;
  name: string;
  values: { id: string; value: string; position: number }[];
}

/** A set's options with names and value labels from the category's form, so it can be read and its variants named. */
function labelledOptions(set: SetInput, rows: readonly CategoryFormRow[]): LabelledOption[] {
  const byAttr = new Map(rows.map((r) => [r.attributeId, r]));
  return set.options.map((o) => {
    const row = byAttr.get(o.attributeId);
    const labels = new Map((row?.values ?? []).map((v) => [v.id, v.label]));
    return {
      position: o.position,
      name: row?.name ?? "Option",
      values: o.values.map((v) => ({ id: v.id, position: v.position, value: labels.get(v.allowedValueId) ?? "" })),
    };
  });
}

/** The live set (removed variants excluded) in the shape a proposal carries. */
export function liveSetOf(set: VariantSet): SetInput {
  return {
    options: set.options.map((o) => ({
      id: o.id, position: o.position, attributeId: o.attributeId,
      values: o.values.map((v) => ({ id: v.id, allowedValueId: v.allowedValueId, position: v.position })),
    })),
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

/** Details as a reviewer reads them: the product's rows in form order, and each variant's own. */
function renderDetails(
  rows: readonly CategoryFormRow[],
  details: readonly DetailInput[],
  variantLabels: ReadonlyMap<string, string | null>,
): { product: ReviewDetailRowDTO[]; byVariant: Map<string, ReviewDetailRowDTO[]>; text: Map<string, string> } {
  const byAttr = new Map(details.map((d) => [d.attributeId, d]));
  const product: ReviewDetailRowDTO[] = [];
  const byVariant = new Map<string, ReviewDetailRowDTO[]>();
  const text = new Map<string, string>();
  for (const row of rows) {
    const d = byAttr.get(row.attributeId);
    if (!d) continue;
    if (d.value) {
      const v = formatAttributeValue(row, d.value);
      product.push({ label: row.name, value: v });
      text.set(row.attributeId, v);
      continue;
    }
    const parts: string[] = [];
    for (const p of d.perVariant ?? []) {
      const v = formatAttributeValue(row, p.value);
      const list = byVariant.get(p.variantId) ?? [];
      list.push({ label: row.name, value: v });
      byVariant.set(p.variantId, list);
      parts.push(`${variantLabels.get(p.variantId) ?? "A variant"}: ${v}`);
    }
    product.push({ label: row.name, value: "Differs by variant" });
    text.set(row.attributeId, parts.join("; "));
  }
  return { product, byVariant, text };
}

/** Recommended details still empty, by name. */
function missingRecommendedOf(rows: readonly CategoryFormRow[], details: readonly DetailInput[], optionAttrs: ReadonlySet<string>): string[] {
  const held = new Set(details.map((d) => d.attributeId));
  return rows.filter((r) => r.level === "recommended" && !held.has(r.attributeId) && !optionAttrs.has(r.attributeId)).map((r) => r.name);
}

function factOverridesOf(facts: { storage: string; gstStatus: string; ageRestricted: boolean }, defaults: { storage: string | null; gstStatus: string | null; ageRestricted: boolean | null }): FactKey[] {
  const out: FactKey[] = [];
  if (defaults.storage !== null && facts.storage !== defaults.storage) out.push("storage");
  if (defaults.gstStatus !== null && facts.gstStatus !== defaults.gstStatus) out.push("gstStatus");
  if (defaults.ageRestricted !== null && facts.ageRestricted !== defaults.ageRestricted) out.push("ageRestricted");
  return out;
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

function detailsOf(p: repo.ProductRow, productDetails: ReviewDetailRowDTO[], options: LabelledOption[]): ReviewDetailRowDTO[] {
  return [
    { label: "Name", value: p.name },
    { label: "Short description", value: p.short_description },
    { label: "Long description", value: p.long_description },
    { label: "Brand", value: p.brand },
    { label: "Category", value: (p.category_path ?? [p.category_name]).join(" › ") },
    // Prices, codes and weights are per variant, in `variants`.
    { label: "Options", value: optionsText(options) ?? "None — one variant" },
    { label: "Unit pricing", value: basisWords(p.unit_basis) },
    { label: "Storage", value: STORAGE_WORDS[p.storage] },
    { label: "GST", value: GST_STATUS_WORDS[p.gst_status] },
    { label: "18+", value: yesNo(p.age_restricted) },
    ...productDetails,
  ];
}

const moneyOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v).toFixed(2));

/** The shop's own price when no margin is set. A malformed amount shows as itself. */
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
  { key: "packQuantity", label: "Net quantity", show: (v) => (v.packQuantity ? `${Number(v.packQuantity)} ${v.packUnit ?? ""}`.trim() : null) },
  { key: "mediaStorageKey", label: "Picture", show: (v) => (v.mediaStorageKey ? "Own picture" : null) },
];

/** Every variant the decision would make live, its price under `margin`, and what the change does to it. */
function reviewVariants(
  live: VariantSet, target: SetInput | null, margin: Margin | null, rows: readonly CategoryFormRow[],
  variantDetails: ReadonlyMap<string, ReviewDetailRowDTO[]>,
): ReviewVariantDTO[] {
  const liveSet = liveSetOf(live);
  const set = target ?? liveSet;
  const options = labelledOptions(set, rows);
  const liveById = new Map(liveSet.variants.map((v) => [v.id, v]));
  const liveRows = new Map(live.variants.map((v) => [v.id, v]));
  const out: ReviewVariantDTO[] = [...set.variants]
    .sort((a, b) => a.position - b.position)
    .map((v) => {
      const was = liveById.get(v.id);
      const changed = !was ? "added" : VARIANT_FIELDS.some((f) => f.show(was) !== f.show(v)) || String(was.optionValueIds) !== String(v.optionValueIds) ? "changed" : "unchanged";
      return {
        id: v.id,
        label: variantLabel(options, v.optionValueIds),
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
        details: variantDetails.get(v.id) ?? [],
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
        details: [],
      });
    }
  }
  return out;
}

/** The per-variant and option rows of a change's before/after, keyed `variant:<id>:<field>`. */
function variantChanges(live: VariantSet, target: SetInput, liveRows: readonly CategoryFormRow[], targetRows: readonly CategoryFormRow[]): ReviewFieldChangeDTO[] {
  const out: ReviewFieldChangeDTO[] = [];
  const liveSet = liveSetOf(live);
  const liveOptions = labelledOptions(liveSet, liveRows);
  const targetOptions = labelledOptions(target, targetRows);
  const before = optionsText(liveOptions);
  const after = optionsText(targetOptions);
  if (before !== after) out.push({ field: "options", label: "Options", before, after });
  const liveById = new Map(liveSet.variants.map((v) => [v.id, v]));
  for (const v of target.variants) {
    const label = variantLabel(targetOptions, v.optionValueIds) ?? "The product";
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
    if (!kept.has(v.id)) out.push({ field: `variant:${v.id}`, label: `${variantLabel(liveOptions, v.optionValueIds) ?? "The product"} — removed`, before: "Sold", after: null });
  }
  return out;
}

/** A new shop price (or variant) means the margin must be confirmed. */
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
      // New by object, so re-registering a live image is not new.
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
  gstStatus?: unknown;
  storage?: unknown;
  ageRestricted?: unknown;
  details?: unknown;
  unitBasis?: unknown;
  options?: unknown;
  variants?: unknown;
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const STORAGES = new Set(["frozen", "chilled", "ambient"]);
const isStorage = (v: unknown): v is Storage => typeof v === "string" && STORAGES.has(v);

function proposedDetails(p: Proposed): DetailInput[] | null {
  return Array.isArray(p.details) ? (p.details as DetailInput[]) : null;
}

/** Everything a reviewer is shown about one product as the decision would make it live. */
interface Prepared {
  p: repo.ProductRow;
  live: VariantSet;
  target: SetInput | null;
  leafId: string;
  path: string[];
  defaults: repo.CategoryFacts["defaults"];
  facts: { storage: Storage; gstStatus: "taxable" | "gst_free"; ageRestricted: boolean };
  liveRows: CategoryFormRow[];
  rows: CategoryFormRow[];
  liveDetails: DetailInput[];
  details: DetailInput[];
}

async function prepare(p: repo.ProductRow, proposed: Proposed | null): Promise<Prepared> {
  const productId = p.id;
  const [sets, liveDetailsMap] = await Promise.all([
    readVariantSets(pooled, [productId]),
    readProductDetails(pooled, [productId], { excludeOptions: true }),
  ]);
  const live = sets.get(productId)!;
  const target = proposed ? proposedSetOf(proposed) : null;
  const newLeaf = proposed && str(proposed.primaryCategoryId) ? str(proposed.primaryCategoryId)! : p.primary_category_id;
  const proposedLeaf = newLeaf !== p.primary_category_id ? await repo.categoryFacts(newLeaf) : null;
  const forms = await readFormRows(pooled, [...new Set([p.primary_category_id, newLeaf])], { includeRetiredValues: true });
  const liveDetails = liveDetailsMap.get(productId) ?? [];
  return {
    p, live, target,
    leafId: newLeaf,
    path: proposedLeaf?.path ?? p.category_path ?? [p.category_name],
    defaults: proposedLeaf?.defaults ?? { storage: p.default_storage, gstStatus: p.default_gst_status, ageRestricted: p.default_age_restricted },
    facts: {
      storage: proposed && isStorage(proposed.storage) ? proposed.storage : p.storage,
      gstStatus: proposed && isGstStatus(proposed.gstStatus) ? proposed.gstStatus : p.gst_status,
      ageRestricted: proposed && typeof proposed.ageRestricted === "boolean" ? proposed.ageRestricted : p.age_restricted,
    },
    liveRows: forms.get(p.primary_category_id) ?? [],
    rows: forms.get(newLeaf) ?? [],
    liveDetails,
    details: (proposed && proposedDetails(proposed)) ?? liveDetails,
  };
}

/** Only what the shop is asking to change. */
function changesOf(x: Prepared, proposed: Proposed): ReviewFieldChangeDTO[] {
  const { p, live } = x;
  const out: ReviewFieldChangeDTO[] = [];
  const add = (field: string, label: string, before: string | null, after: string | null) =>
    out.push({ field, label, before, after });

  if ("name" in proposed) add("name", "Name", p.name, str(proposed.name));
  if ("shortDescription" in proposed) add("shortDescription", "Short description", p.short_description, str(proposed.shortDescription));
  if ("longDescription" in proposed) add("longDescription", "Long description", p.long_description, str(proposed.longDescription));
  if ("brand" in proposed) add("brand", "Brand", p.brand, str(proposed.brand));
  if ("primaryCategoryId" in proposed) {
    add("primaryCategoryId", "Category", (p.category_path ?? [p.category_name]).join(" › "), x.path.join(" › "));
  }
  if ("unitBasis" in proposed) add("unitBasis", "Unit pricing", basisWords(p.unit_basis), basisWords(str(proposed.unitBasis)));
  if (x.target) out.push(...variantChanges(live, x.target, x.liveRows, x.rows));
  if (isStorage(proposed.storage)) add("storage", "Storage", STORAGE_WORDS[p.storage], STORAGE_WORDS[proposed.storage]);
  if (isGstStatus(proposed.gstStatus)) add("gstStatus", "GST", GST_STATUS_WORDS[p.gst_status], GST_STATUS_WORDS[proposed.gstStatus]);
  if (typeof proposed.ageRestricted === "boolean") add("ageRestricted", "18+", yesNo(p.age_restricted), yesNo(proposed.ageRestricted));

  if (proposedDetails(proposed)) {
    const liveLabels = new Map(live.variants.map((v) => [v.id, v.label]));
    const targetSet = x.target ?? liveSetOf(live);
    const targetLabels = new Map(targetSet.variants.map((v) => [v.id, variantLabel(labelledOptions(targetSet, x.rows), v.optionValueIds)]));
    const before = renderDetails(x.liveRows, x.liveDetails, liveLabels).text;
    const after = renderDetails(x.rows, x.details, targetLabels).text;
    const names = new Map([...x.liveRows, ...x.rows].map((r) => [r.attributeId, r]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const b = before.get(id) ?? null;
      const a = after.get(id) ?? null;
      if (b !== a) add(`detail:${names.get(id)?.key ?? id}`, names.get(id)?.name ?? "Detail", b, a);
    }
  }
  return out;
}

export async function item(rawProductId: string | undefined): Promise<ReviewItemDetailDTO> {
  const productId = requireProductId(rawProductId);
  const p = await repo.readProduct(productId);
  if (!p) throw new ReviewError("not_found", "no such review item");

  const [liveMedia, placements] = await Promise.all([repo.readLiveMedia(productId), repo.readPlacements(productId)]);
  const shop = { id: p.shop_id, name: p.shop_name, status: p.shop_status };

  let change: repo.ChangeRow | null = null;
  if (!p.approved) {
    if (p.review_state !== "in_review" || !p.submitted_at) {
      throw new ReviewError("not_found", "this product is not waiting for review");
    }
  } else {
    change = await repo.readChange(productId);
    if (!change || change.state !== "in_review") {
      throw new ReviewError("not_found", "this product has no change waiting for review");
    }
  }
  const proposed = (change?.proposed ?? null) as Proposed | null;
  const x = await prepare(p, proposed);
  const set = x.target ?? liveSetOf(x.live);
  const options = labelledOptions(set, x.rows);
  const labels = new Map(set.variants.map((v) => [v.id, variantLabel(options, v.optionValueIds)]));
  const rendered = renderDetails(x.rows, x.details, labels);
  const optionAttrs = new Set(set.options.flatMap((o) => (o.attributeId ? [o.attributeId] : [])));
  const live101 = {
    categoryPath: x.path,
    facts: x.facts,
    factOverrides: factOverridesOf(x.facts, x.defaults),
    missingRequired: (await missingRequired(pooled, [productId])).get(productId) ?? [],
    missingRecommended: missingRecommendedOf(x.rows, x.details, optionAttrs),
    placements: placements.map((pl) => ({ categoryId: pl.category_id, path: pl.path })),
  };
  const liveOptions = labelledOptions(liveSetOf(x.live), x.liveRows);
  const liveRendered = renderDetails(x.liveRows, x.liveDetails, new Map(x.live.variants.map((v) => [v.id, v.label])));

  if (!p.approved) {
    return {
      productId,
      kind: "new_product",
      version: p.version,
      shop,
      submittedAt: p.submitted_at!.toISOString(),
      productName: p.name,
      details: detailsOf(p, liveRendered.product, liveOptions),
      changes: [],
      images: { current: await images(liveMedia, null), proposed: null },
      // Under no margin yet: the reviewer's margin input recomputes these as they type.
      variants: reviewVariants(x.live, null, null, x.rows, rendered.byVariant),
      currentMargin: null,
      marginRequired: true,
      ...live101,
    };
  }

  const liveKeys = new Set(liveMedia.map((m) => m.storage_key));
  const proposedMedia = change!.media_changed ? await repo.readChangeMedia(change!.id) : null;
  const priceChanges = changesShopPrices(x.live, x.target);

  return {
    productId,
    kind: "change",
    version: change!.version,
    shop,
    submittedAt: change!.submitted_at.toISOString(),
    productName: p.name,
    details: detailsOf(p, liveRendered.product, liveOptions),
    changes: changesOf(x, proposed!),
    images: {
      current: await images(liveMedia, null),
      proposed: proposedMedia ? await images(proposedMedia, liveKeys) : null,
    },
    variants: reviewVariants(x.live, x.target, marginOf(p), x.rows, rendered.byVariant),
    currentMargin: marginOf(p),
    marginRequired: priceChanges || p.margin_kind === null,
    ...live101,
  };
}

/** The live product as review renders it, for back-office's product page (102): no proposal, the current margin. */
export async function liveView(p: repo.ProductRow): Promise<{
  details: ReviewDetailRowDTO[];
  images: ReviewImageDTO[];
  variants: ReviewVariantDTO[];
  margin: MarginDTO | null;
  categoryPath: string[];
  facts: { storage: Storage; gstStatus: "taxable" | "gst_free"; ageRestricted: boolean };
  missingRequired: string[];
  placements: { categoryId: string; path: string[] }[];
}> {
  const [liveMedia, placements, x] = await Promise.all([repo.readLiveMedia(p.id), repo.readPlacements(p.id), prepare(p, null)]);
  const options = labelledOptions(liveSetOf(x.live), x.liveRows);
  const rendered = renderDetails(x.liveRows, x.liveDetails, new Map(x.live.variants.map((v) => [v.id, v.label])));
  return {
    details: detailsOf(p, rendered.product, options),
    images: await images(liveMedia, null),
    variants: reviewVariants(x.live, null, marginOf(p), x.liveRows, rendered.byVariant),
    margin: marginOf(p),
    categoryPath: x.path,
    facts: x.facts,
    missingRequired: (await missingRequired(pooled, [p.id])).get(p.id) ?? [],
    placements: placements.map((pl) => ({ categoryId: pl.category_id, path: pl.path })),
  };
}

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

/** The "was" price carries the same margin, so a discount survives Effy's margin. */
async function decidedVariants(tx: Parameters<typeof readVariantSets>[0], productId: string): Promise<ReviewDecisionDTO["variants"]> {
  const set = (await readVariantSets(tx, [productId], { states: ["active", "inactive"] })).get(productId)!;
  return set.variants.map((v) => ({ id: v.id, label: v.label, shopPriceAmount: v.shopPriceAmount, customerPriceAmount: v.priceAmount ?? v.shopPriceAmount }));
}

/** Refused by the one writers at approval, so it goes back to the shop. */
function asReviewError(err: unknown): never {
  if (err instanceof VariantSetInvalid) {
    throw new ReviewError("validation", "the proposed sizes are no longer valid — send this back", err.errors);
  }
  if (err instanceof DetailsInvalid) {
    throw new ReviewError("validation", "the proposed details no longer fit the category — send this back", err.errors);
  }
  throw err;
}

/** Inside the decision: what would go live must carry every required detail (101 FR-007, approval). */
async function requireComplete(tx: Parameters<typeof missingRequired>[0], productId: string): Promise<void> {
  const missing = (await missingRequired(tx, [productId])).get(productId) ?? [];
  if (missing.length > 0) {
    throw new ReviewError("validation", "missing_required_details", missing.map((m) => ({ field: "details", message: `${m} is required` })));
  }
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

      if (!p.approved) {
        if (p.review_state !== "in_review" || p.version !== version) throw new ReviewError("conflict", STALE);
        await requireComplete(tx, productId);
        // Zero is a margin; absent is not.
        const margin = requireMargin(body.margin);
        if (!(await repo.approveNewProduct(tx, productId, version, marginWrite(margin)))) throw new ReviewError("conflict", STALE);
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

      const change = await repo.readChange(productId, tx, true);
      if (!change || change.state !== "in_review" || change.version !== version) {
        throw new ReviewError("conflict", STALE);
      }
      const proposed = change.proposed as Proposed;

      // A category retired, or given sub-categories, after the proposal cannot become the product's home.
      const newLeaf = str(proposed.primaryCategoryId);
      if (newLeaf) {
        const facts = await repo.categoryFacts(newLeaf, tx);
        if (!facts || !facts.isLeaf) throw new ReviewError("validation", "the proposed category is no longer available — send this back");
      }

      const live = (await readVariantSets(tx, [productId])).get(productId)!;
      const target = proposedSetOf(proposed);
      const current = marginOf(p);
      // A new shop price or variant reopens the margin, as does a product that never had one.
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
          primaryCategoryId: newLeaf ?? p.primary_category_id,
          storage: isStorage(proposed.storage) ? proposed.storage : p.storage,
          ageRestricted: typeof proposed.ageRestricted === "boolean" ? proposed.ageRestricted : p.age_restricted,
          unitBasis,
        },
        marginWrite(margin),
        change.media_changed,
      );
      if (isGstStatus(proposed.gstStatus)) {
        await setGstStatus(tx, productId, proposed.gstStatus, { kind: "admin_staff", sub: actorSub }, "review");
      }
      // After the images (a variant may name one); a dropped variant is removed but kept for history.
      if (target) {
        await applyVariantSet(tx, { productId, shopId: p.shop_id, options: target.options, variants: target.variants, unitBasis, mode: "live" }).catch(asReviewError);
      } else if ("unitBasis" in proposed) {
        const errors = validateVariantSet(liveSetOf(live).options, liveSetOf(live).variants, unitBasis);
        if (errors.length > 0) throw new ReviewError("validation", "the proposed unit pricing does not fit the sizes — send this back", errors);
      }
      // A new home drops what its form does not ask for; proposed details replace the set after the variants.
      if (newLeaf && newLeaf !== p.primary_category_id) await reconcileDetails(tx, productId, { dropHidden: true });
      const details = proposedDetails(proposed);
      if (details) await writeProductDetails(tx, productId, details).catch(asReviewError);
      await requireComplete(tx, productId);
      await priceVariants(tx, productId, margin);
      const variants = await decidedVariants(tx, productId);

      await repo.audit(tx, actorSub, "product.change_approved", productId, {
        shopId: p.shop_id,
        // Which details changed, never their values.
        changed: [...Object.keys(proposed), ...(change.media_changed ? ["images"] : [])].sort(),
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

/** The shop is not notified: the margin is Effy's figure and is kept from shops. */
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
