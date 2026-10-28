// Back-office products (102): the list across every shop and one product's page. Rendering of a product
// is review's (`liveView`), so the two screens never describe one product two ways.

import { offsetListPage, pooled, presignRead } from "@effy/edge-shared";
import { readProductDetails, readVariantSets } from "@effy/edge-shared/catalog";
import {
  BACKOFFICE_PRODUCT_TABS,
  type BackOfficeProductDTO,
  type BackOfficeProductListDTO,
  type BackOfficeProductRowDTO,
  type EffyProductContentDTO,
  type MarginDTO,
  type ProductHistoryAction,
  type ProductHistoryEntryDTO,
} from "@effy/shared-types";

import * as reviewRepo from "../review/repository";
import { liveSetOf, liveView } from "../review/service";
import { ProductAdminError } from "./errors";
import type { ProductListRequest } from "./list";
import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireProductId(id: string | undefined): string {
  if (!id || !UUID.test(id)) throw new ProductAdminError("not_found", "no such product");
  return id;
}

function trimDecimal(v: string): string {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

const marginOf = (kind: "percent" | "amount" | null, value: string | null): MarginDTO | null =>
  kind && value !== null ? { kind, value: trimDecimal(value) } : null;


/** Staff read pictures presigned, as product review does: a product not yet on sale is not the CDN's to serve. */
async function rowDTO(r: repo.ListRow): Promise<BackOfficeProductRowDTO> {
  return {
    productId: r.id,
    name: r.name,
    brand: r.brand,
    imageUrl: r.primary_storage_key ? await presignRead(r.primary_storage_key) : null,
    shop: { id: r.shop_id, name: r.shop_name, status: r.shop_status },
    categoryPath: r.category_path ?? [],
    variantCount: r.variant_count,
    shopPriceFrom: r.shop_price_from,
    customerPriceFrom: r.customer_price_from,
    priceVaries: r.price_varies,
    margin: marginOf(r.margin_kind, r.margin_value),
    state: r.state,
    origin: r.created_via,
    effySettingUp: r.content_owner === "effy",
    lowStock: r.low_stock,
    missingRequired: r.missing_required,
    updatedAt: r.updated_at.toISOString(),
    version: r.version,
  };
}

/**
 * One page of every shop's products (103): the state tab's count is the page's total, so the counts the tabs
 * show and the pager agree, and a page past the end is answered with the last real one.
 */
export async function list(req: ProductListRequest): Promise<BackOfficeProductListDTO> {
  const counts = await repo.countProducts(repo.filtersOf(req));
  const all = [...counts.values()].reduce((a, b) => a + b, 0);
  const tabCounts = Object.fromEntries(
    BACKOFFICE_PRODUCT_TABS.map((t) => [t, t === "all" ? all : (counts.get(t) ?? 0)]),
  ) as BackOfficeProductListDTO["counts"];
  const total = req.filters.state ? (counts.get(req.filters.state) ?? 0) : all;
  const page = Math.min(req.page, Math.max(1, Math.ceil(total / req.pageSize)));
  const rows = total === 0 ? [] : await repo.listProducts(req, { limit: req.pageSize, offset: (page - 1) * req.pageSize });
  return { ...offsetListPage(await Promise.all(rows.map(rowDTO)), req, { total, page }), counts: tabCounts };
}

const HISTORY_ACTIONS: Record<string, ProductHistoryAction> = {
  "product.approved": "approved",
  "product.sent_back": "sent_back",
  "product.change_approved": "change_approved",
  "product.change_sent_back": "change_sent_back",
  "product.margin_set": "margin_set",
  "catalog.placements_set": "placements_set",
  "product.held": "held",
  "product.released": "released",
  "product.created_by_effy": "created_by_effy",
  "product.effy_edited": "effy_edited",
  "product.effy_completed": "effy_completed",
  "product.variant_state_set": "variant_state_set",
};

const marginWords = (m: unknown): string | null => {
  if (!m || typeof m !== "object") return null;
  const { kind, value } = m as { kind?: unknown; value?: unknown };
  if (typeof value !== "string" && typeof value !== "number") return null;
  return kind === "percent" ? `${trimDecimal(String(value))}%` : `$${Number(value).toFixed(2)}`;
};

function noteOf(action: ProductHistoryAction, detail: Record<string, unknown>): string | null {
  switch (action) {
    case "sent_back":
    case "change_sent_back":
    case "held":
      return typeof detail.reason === "string" ? detail.reason : null;
    case "approved":
    case "change_approved":
    case "margin_set":
      return marginWords(detail.marginAfter);
    case "released":
      return typeof detail.releasedTo === "string" ? (detail.releasedTo === "active" ? "Back on sale" : "Not on sale") : null;
    case "variant_state_set":
      return typeof detail.label === "string" || detail.to
        ? `${typeof detail.label === "string" ? `${detail.label}: ` : ""}${detail.to === "active" ? "on sale" : "off sale"}`
        : null;
    default:
      return null;
  }
}

function historyOf(rows: repo.HistoryRow[], extra: repo.ProductExtraRow): ProductHistoryEntryDTO[] {
  const out: ProductHistoryEntryDTO[] = [];
  for (const r of rows) {
    const action = HISTORY_ACTIONS[r.action];
    if (!action) continue;
    out.push({ at: r.created_at.toISOString(), action, actor: r.actor_name, note: noteOf(action, r.detail ?? {}) });
  }
  // A shop's creation is not audited by staff; it is the product's own first fact.
  if (extra.created_via === "shop") {
    out.push({ at: extra.created_at.toISOString(), action: "created", actor: null, note: null });
  }
  return out;
}

export async function detail(rawProductId: string | undefined): Promise<BackOfficeProductDTO> {
  const productId = requireProductId(rawProductId);
  const [p, extra] = await Promise.all([reviewRepo.readProduct(productId), repo.readExtra(productId)]);
  if (!p || !extra) throw new ProductAdminError("not_found", "no such product");
  const [view, history, stock] = await Promise.all([liveView(p), repo.readHistory(productId), repo.readVariantStock(productId)]);
  const stockById = new Map(stock.map((s) => [s.id, s]));

  return {
    productId,
    version: p.version,
    name: p.name,
    shop: { id: p.shop_id, name: p.shop_name, status: p.shop_status },
    state: extra.state,
    origin: extra.created_via,
    import: extra.import_id ? { id: extra.import_id, fileName: extra.import_file_name ?? "" } : null,
    effySettingUp: extra.content_owner === "effy",
    hold: extra.held_at
      ? { reason: extra.held_reason ?? "", heldAt: extra.held_at.toISOString(), heldBy: extra.held_by_name }
      : null,
    waitingForReview:
      !extra.approved && extra.review_state === "in_review" ? "new_product" : extra.change_state === "in_review" ? "change" : null,
    details: view.details,
    images: view.images,
    variants: view.variants.map((v) => {
      const s = stockById.get(v.id);
      return {
        ...v,
        stockTracked: s?.stock_tracked ?? false,
        stockOnHand: s?.stock_on_hand ?? null,
        lowStockThreshold: s?.low_stock_threshold ?? null,
      };
    }),
    margin: view.margin,
    categoryPath: view.categoryPath,
    facts: view.facts,
    missingRequired: view.missingRequired,
    placements: view.placements,
    history: historyOf(history, extra),
    effyContent: extra.content_owner === "effy" ? await effyContentOf(p) : null,
    createdAt: extra.created_at.toISOString(),
    updatedAt: extra.updated_at.toISOString(),
  };
}

/** The product in the form's shape, for Effy to finish it (102). */
async function effyContentOf(p: reviewRepo.ProductRow): Promise<EffyProductContentDTO> {
  const [sets, details, media] = await Promise.all([
    readVariantSets(pooled, [p.id]),
    readProductDetails(pooled, [p.id], { excludeOptions: true }),
    reviewRepo.readLiveMedia(p.id),
  ]);
  const set = liveSetOf(sets.get(p.id)!);
  return {
    primaryCategoryId: p.primary_category_id,
    name: p.name,
    brand: p.brand,
    shortDescription: p.short_description,
    longDescription: p.long_description,
    storage: p.storage,
    gstStatus: p.gst_status,
    ageRestricted: p.age_restricted,
    unitBasis: (p.unit_basis as EffyProductContentDTO["unitBasis"]) ?? null,
    options: set.options,
    variants: set.variants.map((v) => ({ ...v, weightGrams: v.weightGrams ?? null })),
    details: details.get(p.id) ?? [],
    media: await Promise.all(
      media.map(async (m) => ({ storageKey: m.storage_key, url: await presignRead(m.storage_key), isPrimary: m.is_primary, displayOrder: m.display_order })),
    ),
  };
}
