// Product review — service layer (067).
//
// A reviewer sees what a shop submitted, decides, and — when approving — sets what Effy adds on top.
// This file turns rows into what a reviewer reads (a list of details, a before/after of only what
// changed) and turns a decision into one transaction.

import {
  customerPrice,
  presignRead,
  validateMargin,
  type Margin,
} from "@effy/edge-shared";
import {
  REVIEW_REASON_MAX,
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

  // One extra row tells us whether there is a next page without a second query.
  const rows = await repo.listQueue({
    shopId: params.shopId ?? null,
    kind,
    q: params.q?.trim() ? params.q.trim() : null,
    afterSubmittedAt: cursor?.[0] ?? null,
    afterProductId: cursor?.[1] ?? null,
    limit: limit + 1,
  });
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

function detailsOf(p: repo.ProductRow, attrs: repo.AttributeRow[]): ReviewDetailRowDTO[] {
  return [
    { label: "Name", value: p.name },
    { label: "Short description", value: p.short_description },
    { label: "Long description", value: p.long_description },
    { label: "Brand", value: p.brand },
    { label: "SKU", value: p.sku },
    { label: "Barcode", value: p.gtin },
    { label: "Category", value: p.category_name },
    { label: "Product type", value: p.type_name },
    { label: "Shop price", value: p.shop_price_amount },
    { label: "Shop \"was\" price", value: p.shop_compare_at_amount },
    { label: "Weight (g)", value: String(p.weight_grams) },
    ...attrs.map((a) => ({ label: a.name, value: attributeText(a) })),
  ];
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
  sku?: unknown;
  gtin?: unknown;
  primaryCategoryId?: unknown;
  productTypeId?: unknown;
  priceAmount?: unknown;
  compareAtAmount?: unknown;
  weightGrams?: unknown;
  attributes?: unknown;
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
  if ("sku" in proposed) add("sku", "SKU", p.sku, str(proposed.sku));
  if ("gtin" in proposed) add("gtin", "Barcode", p.gtin, str(proposed.gtin));
  if ("primaryCategoryId" in proposed) {
    const c = names.categories.get(String(proposed.primaryCategoryId));
    add("primaryCategoryId", "Category", p.category_name, c?.name ?? null);
  }
  if ("productTypeId" in proposed) {
    const t = names.types.get(String(proposed.productTypeId));
    add("productTypeId", "Product type", p.type_name, t?.name ?? null);
  }
  if ("priceAmount" in proposed) add("priceAmount", "Shop price", p.shop_price_amount, str(proposed.priceAmount));
  if ("compareAtAmount" in proposed) add("compareAtAmount", "Shop \"was\" price", p.shop_compare_at_amount, str(proposed.compareAtAmount));
  if ("weightGrams" in proposed) add("weightGrams", "Weight (g)", String(p.weight_grams), String(proposed.weightGrams));

  const live = new Map(attrs.map((a) => [a.attribute_definition_id, a]));
  for (const a of pAttrs) {
    const def = names.attributes.get(a.attributeId);
    const was = live.get(a.attributeId);
    add(`attribute:${def?.key ?? a.attributeId}`, def?.name ?? "Attribute", was ? attributeText(was) : null, attributeText(a));
  }
  return out;
}

export async function item(rawProductId: string | undefined): Promise<ReviewItemDetailDTO> {
  const productId = requireProductId(rawProductId);
  const p = await repo.readProduct(productId);
  if (!p) throw new ReviewError("not_found", "no such review item");

  const [attrs, liveMedia] = await Promise.all([repo.readAttributes(productId), repo.readLiveMedia(productId)]);
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
      details: detailsOf(p, attrs),
      changes: [],
      images: { current: await images(liveMedia, null), proposed: null },
      shopPriceAmount: p.shop_price_amount,
      shopCompareAtAmount: p.shop_compare_at_amount,
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
  const priceChanges = "priceAmount" in proposed;

  return {
    productId,
    kind: "change",
    version: change.version,
    shop,
    submittedAt: change.submitted_at.toISOString(),
    productName: p.name,
    details: detailsOf(p, attrs),
    changes: await changesOf(p, attrs, proposed),
    images: {
      current: await images(liveMedia, null),
      proposed: proposedMedia ? await images(proposedMedia, liveKeys) : null,
    },
    shopPriceAmount: priceChanges ? String(proposed.priceAmount) : p.shop_price_amount,
    shopCompareAtAmount:
      "compareAtAmount" in proposed ? str(proposed.compareAtAmount) : p.shop_compare_at_amount,
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

function priceFor(shopPrice: string, shopCompareAt: string | null, margin: Margin | null): repo.PriceWrite {
  if (!MONEY.test(shopPrice)) throw new ReviewError("validation", "the shop price is not a valid amount");
  return {
    marginKind: margin?.kind ?? null,
    marginValue: margin?.value ?? null,
    priceAmount: customerPrice(shopPrice, margin),
    // ⚠ FR-035 — the "was" price carries the SAME margin, so the comparison a customer sees is like
    // for like. A shop "was 12, now 10" must not become "was 12, now 12" once Effy adds 20%.
    compareAtAmount: shopCompareAt !== null && MONEY.test(shopCompareAt) ? customerPrice(shopCompareAt, margin) : null,
  };
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
        const price = priceFor(p.shop_price_amount, p.shop_compare_at_amount, margin);
        if (!(await repo.approveNewProduct(tx, productId, version, price))) throw new ReviewError("conflict", STALE);

        await repo.audit(tx, actorSub, "product.approved", productId, {
          shopId: p.shop_id,
          shopPriceAmount: p.shop_price_amount,
          customerPriceAmount: price.priceAmount,
          marginBefore: null,
          marginAfter: marginDetail(margin),
        });
        await repo.notifyShop(tx, "shop_product_approved", p.shop_id, productId, `${productId}:${version}`);
        return { productId, shopPriceAmount: p.shop_price_amount, customerPriceAmount: price.priceAmount, margin };
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
      );
      // A category or type Effy retired AFTER the shop proposed it cannot become live.
      if ("primaryCategoryId" in proposed && names.categories.get(String(proposed.primaryCategoryId))?.status !== "active") {
        throw new ReviewError("validation", "the proposed category is no longer available — send this back");
      }
      if ("productTypeId" in proposed && names.types.get(String(proposed.productTypeId))?.status !== "active") {
        throw new ReviewError("validation", "the proposed product type is no longer available — send this back");
      }

      const shopPrice = "priceAmount" in proposed ? String(proposed.priceAmount) : p.shop_price_amount;
      const shopCompareAt = "compareAtAmount" in proposed ? str(proposed.compareAtAmount) : p.shop_compare_at_amount;
      const current = marginOf(p);
      // FR-031 — a new shop price reopens the margin; so does a product that never had one.
      const marginRequired = "priceAmount" in proposed || current === null;
      const supplied = body.margin !== undefined && body.margin !== null;
      if (marginRequired && !supplied) {
        const message = "confirm the margin — the shop's price is changing, or none has been set";
        throw new ReviewError("validation", message, [{ field: "margin", message }]);
      }
      const margin = supplied ? requireMargin(body.margin) : current;
      const price = priceFor(shopPrice, shopCompareAt, margin);

      const weight = typeof proposed.weightGrams === "number" && Number.isInteger(proposed.weightGrams) && proposed.weightGrams > 0
        ? proposed.weightGrams
        : null;

      await repo.applyChange(
        tx,
        productId,
        change.id,
        {
          name: str(proposed.name) ?? p.name,
          sku: "sku" in proposed ? str(proposed.sku) : p.sku,
          gtin: "gtin" in proposed ? str(proposed.gtin) : p.gtin,
          brand: "brand" in proposed ? str(proposed.brand) : p.brand,
          shortDescription: str(proposed.shortDescription) ?? p.short_description,
          longDescription: "longDescription" in proposed ? str(proposed.longDescription) : p.long_description,
          productTypeId: str(proposed.productTypeId) ?? p.product_type_id,
          primaryCategoryId: str(proposed.primaryCategoryId) ?? p.primary_category_id,
          weightGrams: weight ?? p.weight_grams,
          weightChanged: weight !== null,
          shopPriceAmount: shopPrice,
          shopCompareAtAmount: shopCompareAt,
        },
        price,
        pAttrs.map((a) => ({
          attributeId: a.attributeId,
          valueText: a.valueText ?? null,
          valueNumber: a.valueNumber ?? null,
          valueBoolean: a.valueBoolean ?? null,
          valueOptions: a.valueOptions ?? null,
        })),
        change.media_changed,
      );

      await repo.audit(tx, actorSub, "product.change_approved", productId, {
        shopId: p.shop_id,
        // WHICH details changed, never their values: a description is not audit data, and the
        // before/after of a price is carried explicitly below.
        changed: [...Object.keys(proposed).filter((k) => k !== "attributes"), ...(pAttrs.length ? ["attributes"] : []), ...(change.media_changed ? ["images"] : [])].sort(),
        shopPriceBefore: p.shop_price_amount,
        shopPriceAfter: shopPrice,
        customerPriceAmount: price.priceAmount,
        marginBefore: marginDetail(current),
        marginAfter: marginDetail(margin),
      });
      await repo.notifyShop(tx, "shop_product_approved", p.shop_id, productId, `${productId}:${version}`);
      return { productId, shopPriceAmount: shopPrice, customerPriceAmount: price.priceAmount, margin };
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
    const price = priceFor(p.shop_price_amount, p.shop_compare_at_amount, margin);
    const ok = await repo.setMargin(tx, productId, { kind: expected?.kind ?? null, value: expected?.value ?? null }, price);
    if (!ok) throw new ReviewError("conflict", "the margin was changed by someone else — reload and look again");

    await repo.audit(tx, actorSub, "product.margin_set", productId, {
      shopId: p.shop_id,
      shopPriceAmount: p.shop_price_amount,
      customerPriceBefore: p.price_amount,
      customerPriceAfter: price.priceAmount,
      marginBefore: marginDetail(marginOf(p)),
      marginAfter: marginDetail(margin),
    });
    return { productId, shopPriceAmount: p.shop_price_amount, customerPriceAmount: price.priceAmount, margin };
  });
}
