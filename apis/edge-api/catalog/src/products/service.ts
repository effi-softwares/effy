// Back-office products (102): the list across every shop and one product's page. Rendering of a product
// is review's (`liveView`), so the two screens never describe one product two ways.

import { pooled, presignRead } from "@effy/edge-shared";
import { readProductDetails, readVariantSets } from "@effy/edge-shared/catalog";
import {
  BACKOFFICE_PRODUCT_SORTS,
  BACKOFFICE_PRODUCT_TABS,
  isBackOfficeProductTab,
  STORAGES,
  type BackOfficeProductDTO,
  type BackOfficeProductListDTO,
  type BackOfficeProductRowDTO,
  type BackOfficeProductSort,
  type BackOfficeProductState,
  type BackOfficeProductTab,
  type EffyProductContentDTO,
  type MarginDTO,
  type ProductHistoryAction,
  type ProductHistoryEntryDTO,
  type Storage,
} from "@effy/shared-types";

import * as reviewRepo from "../review/repository";
import { liveSetOf, liveView } from "../review/service";
import { ProductAdminError } from "./errors";
import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PAGE_SIZE = 50;
/** Deeper than this, a search is the better tool. */
const MAX_OFFSET = 5_000;

export function requireProductId(id: string | undefined): string {
  if (!id || !UUID.test(id)) throw new ProductAdminError("not_found", "no such product");
  return id;
}

function trimDecimal(v: string): string {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

const marginOf = (kind: "percent" | "amount" | null, value: string | null): MarginDTO | null =>
  kind && value !== null ? { kind, value: trimDecimal(value) } : null;

const optUuid = (v: string | undefined, field: string): string | null => {
  if (v === undefined || v === "") return null;
  if (!UUID.test(v)) throw new ProductAdminError("validation", `${field} is not valid`, [{ field, message: "is not valid" }]);
  return v;
};

/** The cursor is the next row's offset, opaque to the client. */
function decodeCursor(raw: string | undefined): number {
  if (!raw) return 0;
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const n = /^\d{1,6}$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(n) || n > MAX_OFFSET) throw new ProductAdminError("validation", "the paging cursor is not valid");
  return n;
}

const encodeCursor = (offset: number): string => Buffer.from(String(offset), "utf8").toString("base64url");

export interface ParsedQuery {
  filters: repo.ListFilters;
  state: BackOfficeProductState | null;
  sort: BackOfficeProductSort;
  dir: "asc" | "desc" | null;
  offset: number;
}

export function parseQuery(params: Record<string, string | undefined>): ParsedQuery {
  const q = params.q?.trim() ? params.q.trim().slice(0, 200) : null;
  const tab: BackOfficeProductTab = isBackOfficeProductTab(params.state) ? params.state : "all";
  const storage = params.storage && (STORAGES as readonly string[]).includes(params.storage) ? (params.storage as Storage) : null;
  const margin = params.margin === "set" || params.margin === "not_set" ? params.margin : null;
  const sort = (BACKOFFICE_PRODUCT_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as BackOfficeProductSort)
    : "updated";
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : null;
  return {
    filters: {
      q,
      shopId: optUuid(params.shopId, "shopId"),
      categoryId: optUuid(params.categoryId, "categoryId"),
      storage,
      margin,
      missingDetails: params.missingDetails === "true",
      lowStock: params.lowStock === "true",
    },
    state: tab === "all" ? null : tab,
    sort,
    dir,
    offset: decodeCursor(params.cursor),
  };
}

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

export async function list(params: Record<string, string | undefined>): Promise<BackOfficeProductListDTO> {
  const p = parseQuery(params);
  const [rows, counts] = await Promise.all([
    repo.listProducts(p.filters, p.state, p.sort, p.dir, p.offset, PAGE_SIZE + 1),
    repo.countProducts(p.filters),
  ]);
  const all = [...counts.values()].reduce((a, b) => a + b, 0);
  const tabCounts = Object.fromEntries(
    BACKOFFICE_PRODUCT_TABS.map((t) => [t, t === "all" ? all : (counts.get(t) ?? 0)]),
  ) as BackOfficeProductListDTO["counts"];
  const next = p.offset + PAGE_SIZE;
  return {
    items: await Promise.all(rows.slice(0, PAGE_SIZE).map(rowDTO)),
    counts: tabCounts,
    nextCursor: rows.length > PAGE_SIZE && next <= MAX_OFFSET ? encodeCursor(next) : null,
  };
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
