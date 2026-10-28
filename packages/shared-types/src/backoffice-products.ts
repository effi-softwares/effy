import type { ListPage } from "./list";
/**
 * Back-office products (102), served by the catalog service on the staff gateway: every shop's products
 * in one list, a product's whole page, holds, Effy-created products and imports. These types carry Effy's
 * margin and other shops' names, so nothing here is returned by a shop route.
 */

import type { WireInt } from "./cart";
import type { GstStatus } from "./documents";
import type { MarginDTO, ReviewDetailRowDTO, ReviewImageDTO, ReviewVariantDTO } from "./product-review";
import type { DetailInput, Storage } from "./taxonomy";
import type { UnitBasis } from "./unit-price";
import type { OptionInputDTO, VariantInputDTO } from "./variants";

/** Where a product stands, as back-office sees it. One SQL expression decides it (catalog `BACKOFFICE_STATE_SQL`). */
export type BackOfficeProductState =
  | "on_sale"
  | "in_review"
  | "change_pending"
  | "held"
  | "off_sale"
  | "draft"
  | "archived";

/** The list's tabs, in order; "all" first. */
export const BACKOFFICE_PRODUCT_TABS = [
  "all",
  "on_sale",
  "in_review",
  "change_pending",
  "held",
  "off_sale",
  "draft",
  "archived",
] as const;
export type BackOfficeProductTab = (typeof BACKOFFICE_PRODUCT_TABS)[number];

export const BACKOFFICE_PRODUCT_STATE_WORDS: Record<BackOfficeProductTab, string> = {
  all: "All",
  on_sale: "On sale",
  in_review: "In review",
  change_pending: "Change pending",
  held: "Held by Effy",
  off_sale: "Off sale",
  draft: "Draft",
  archived: "Archived",
};

export function isBackOfficeProductTab(v: unknown): v is BackOfficeProductTab {
  return typeof v === "string" && (BACKOFFICE_PRODUCT_TABS as readonly string[]).includes(v);
}

/** Where a product came from. */
export type ProductOrigin = "shop" | "effy" | "import";

export const PRODUCT_ORIGIN_WORDS: Record<ProductOrigin, string> = {
  shop: "Shop",
  effy: "Added by Effy",
  import: "Imported",
};

export const BACKOFFICE_PRODUCT_SORTS = ["updated", "name", "price", "shop"] as const;
export type BackOfficeProductSort = (typeof BACKOFFICE_PRODUCT_SORTS)[number];

/** The list's query, as the URL carries it. Every field optional; absent = no filter. */
export interface BackOfficeProductQuery {
  q?: string;
  shopId?: string;
  /** A category; its descendants are included. */
  categoryId?: string;
  state?: BackOfficeProductTab;
  storage?: Storage;
  margin?: "set" | "not_set";
  missingDetails?: boolean;
  lowStock?: boolean;
  sort?: BackOfficeProductSort;
  dir?: "asc" | "desc";
  cursor?: string;
}

export interface BackOfficeProductRowDTO {
  productId: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  shop: { id: string; name: string; status: string };
  /** The home leaf, department first. */
  categoryPath: string[];
  /** Sizes that are not removed. */
  variantCount: WireInt;
  /** The lowest shop price among on-sale sizes. */
  shopPriceFrom: string | null;
  /** The lowest customer price among on-sale sizes; null until approved. */
  customerPriceFrom: string | null;
  priceVaries: boolean;
  margin: MarginDTO | null;
  state: BackOfficeProductState;
  origin: ProductOrigin;
  /** Effy is still finishing a product it created. */
  effySettingUp: boolean;
  lowStock: boolean;
  missingRequired: WireInt;
  updatedAt: string;
  /** Echo on an action; a stale one is refused. Opaque. */
  version: string;
}

/** A console list page (103) with every tab's count under the current search and filters (the tab itself ignored). */
export interface BackOfficeProductListDTO extends ListPage<BackOfficeProductRowDTO> {
  counts: Record<BackOfficeProductTab, WireInt>;
}

export interface ProductHoldDTO {
  reason: string;
  heldAt: string;
  /** The staff member's name, for staff only. */
  heldBy: string | null;
}

export type ProductHistoryAction =
  | "created"
  | "approved"
  | "sent_back"
  | "change_approved"
  | "change_sent_back"
  | "margin_set"
  | "placements_set"
  | "held"
  | "released"
  | "created_by_effy"
  | "effy_edited"
  | "effy_completed"
  | "variant_state_set";

export const PRODUCT_HISTORY_WORDS: Record<ProductHistoryAction, string> = {
  created: "Created by the shop",
  approved: "Approved",
  sent_back: "Sent back",
  change_approved: "Change approved",
  change_sent_back: "Change sent back",
  margin_set: "Margin set",
  placements_set: "Also-shown-in aisles set",
  held: "Held",
  released: "Released",
  created_by_effy: "Created by Effy",
  effy_edited: "Edited by Effy",
  effy_completed: "Finished by Effy and put on sale",
  variant_state_set: "Size on/off sale",
};

export interface ProductHistoryEntryDTO {
  at: string;
  action: ProductHistoryAction;
  /** A staff member's name; null for the shop or the system. */
  actor: string | null;
  /** One line about it (a reason, a margin, a size), or null. */
  note: string | null;
}

export interface BackOfficeVariantDTO extends ReviewVariantDTO {
  stockTracked: boolean;
  stockOnHand: WireInt | null;
  lowStockThreshold: WireInt | null;
}

export interface BackOfficeProductDTO {
  productId: string;
  version: string;
  name: string;
  shop: { id: string; name: string; status: string };
  state: BackOfficeProductState;
  origin: ProductOrigin;
  import: { id: string; fileName: string } | null;
  effySettingUp: boolean;
  hold: ProductHoldDTO | null;
  /** A never-approved product waiting in the review queue, or a live product's change waiting. */
  waitingForReview: "new_product" | "change" | null;
  details: ReviewDetailRowDTO[];
  images: ReviewImageDTO[];
  variants: BackOfficeVariantDTO[];
  margin: MarginDTO | null;
  categoryPath: string[];
  facts: { storage: Storage; gstStatus: GstStatus; ageRestricted: boolean };
  missingRequired: string[];
  placements: { categoryId: string; path: string[] }[];
  history: ProductHistoryEntryDTO[];
  /** The product as Effy's form edits it — only while Effy is still finishing it (`effySettingUp`). */
  effyContent: EffyProductContentDTO | null;
  createdAt: string;
  updatedAt: string;
}

/** A product's content in the form's own shape (102): what `PATCH /catalog/v1/products/{id}` takes back. */
export interface EffyProductContentDTO {
  primaryCategoryId: string;
  name: string;
  brand: string | null;
  shortDescription: string;
  longDescription: string | null;
  storage: Storage;
  gstStatus: GstStatus;
  ageRestricted: boolean;
  unitBasis: UnitBasis | null;
  options: OptionInputDTO[];
  variants: VariantInputDTO[];
  details: DetailInput[];
  media: { storageKey: string; url: string; isPrimary: boolean; displayOrder: WireInt }[];
}

export const HOLD_REASON_MAX = 500;

export interface HoldProductRequest {
  version: string;
  /** 1 to 500 characters; the shop sees it, from Effy. */
  reason: string;
}

export interface ReleaseProductRequest {
  version: string;
}

export interface ReleaseProductResultDTO {
  product: BackOfficeProductDTO;
  releasedTo: "draft" | "active" | "unavailable";
  /** Why it did not go back on sale, when it was on sale before the hold. */
  notOnSaleBecause: "no_main_picture" | "shop_not_active" | null;
}

export interface StaffVariantStateRequest {
  version: string;
  state: "active" | "inactive";
}

export const BULK_PRODUCTS_MAX = 200;

export interface BulkProductsRequest {
  action: "hold" | "release" | "margin";
  items: { productId: string; version: string }[];
  reason?: string;
  margin?: MarginDTO;
}

export interface BulkProductsResultDTO {
  done: string[];
  refused: { productId: string; reason: string }[];
}

// ── Imports ──────────────────────────────────────────────────────────────────────────────────────────

export const IMPORT_ROWS_MAX = 500;

export type ProductImportState = "checking" | "checked" | "creating" | "done" | "failed";
export type ProductImportRowResult = "pending" | "ready" | "not_ready" | "created" | "left_out";

export const PRODUCT_IMPORT_STATE_WORDS: Record<ProductImportState, string> = {
  checking: "Checking…",
  checked: "Checked",
  creating: "Creating…",
  done: "Done",
  failed: "Failed",
};

/** The browser's parse of the uploaded sheet: the header and each row's cells, all strings. */
export interface StartProductImportRequest {
  shopId: string;
  fileName: string;
  /** Lowercase hex SHA-256 of the file. */
  fileSha256: string;
  margin: MarginDTO;
  columns: string[];
  /** Row 2 of the sheet first; blank rows already dropped by the browser, row numbers kept. */
  rows: { rowNumber: WireInt; cells: string[] }[];
}

export interface ProductImportProblemDTO {
  column: string | null;
  message: string;
}

export interface ProductImportProductDTO {
  key: string;
  name: string;
  result: ProductImportRowResult;
  productId: string | null;
  pictures: WireInt;
  rows: { rowNumber: WireInt; sku: string; problems: ProductImportProblemDTO[] }[];
}

export interface ProductImportSummaryDTO {
  importId: string;
  shop: { id: string; name: string };
  fileName: string;
  state: ProductImportState;
  createdBy: string | null;
  createdAt: string;
  counts: { rows: WireInt; ready: WireInt; created: WireInt; leftOut: WireInt };
}

export interface ProductImportDTO extends ProductImportSummaryDTO {
  margin: MarginDTO;
  products: ProductImportProductDTO[];
  /** The same file was imported for this shop before. */
  repeatOf: { importId: string; createdAt: string } | null;
  version: string;
}

/** A console list page (103). */
export type ProductImportListDTO = ListPage<ProductImportSummaryDTO>;

export interface CreateProductImportRequest {
  version: string;
}

/** The template's columns; the browser writes the file. */
export interface ProductImportTemplateDTO {
  columns: { name: string; required: boolean; help: string }[];
}
