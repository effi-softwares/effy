import type { OptionRow, ProductContentInput, VariantRow } from "@effy/edge-shared/catalog";
import type { DetailInput, FactDefaults, GstStatus, OptionInputDTO, Storage, UnitBasis, VariantInputDTO } from "@effy/shared-types";

export type ProductStatus = "draft" | "active" | "unavailable" | "archived";
export const PRODUCT_STATUSES: readonly ProductStatus[] = ["draft", "active", "unavailable", "archived"];

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductListItem {
  id: string;
  name: string;
  brand: string | null;
  primaryImageUrl: string | null;
  /** The home leaf's name. */
  categoryName: string;
  /** The lowest shop price among active variants. */
  priceAmount: string;
  currency: string;
  status: ProductStatus;
  updatedAt: string;
  /** Where the product stands with review. */
  reviewState: ShopReviewState;
  /** The lowest customer price among active variants; null until first approved. */
  customerPriceAmount: string | null;
  /** Active variants' shop prices differ. */
  priceVaries: boolean;
  /** Variants that are not removed. */
  variantCount: number;
  /** Required details still empty. */
  missingRequired: number;
  hold: ProductHoldShown | null;
  createdBy: "shop" | "effy";
}

/** See `REVIEW_STATE_SQL` in repository.ts. */
export type ShopReviewState =
  | "draft"
  | "in_review"
  | "sent_back"
  | "live"
  | "live_change_pending"
  | "live_change_sent_back"
  | "effy_setup";

/** Effy's hold as the shop sees it (102). */
export interface ProductHoldShown {
  reason: string;
  heldAt: string;
}

/** Only the details that differ from the live product. */
export interface ProductChangeProposal {
  name?: string;
  shortDescription?: string;
  longDescription?: string | null;
  brand?: string | null;
  primaryCategoryId?: string;
  gstStatus?: GstStatus;
  storage?: Storage;
  ageRestricted?: boolean;
  /** The complete proposed details, only when they differ from live. */
  details?: DetailInput[];
  unitBasis?: UnitBasis | null;
  /** The complete proposed option set, only when it differs from live. */
  options?: OptionInputDTO[];
  /** The complete proposed variant set (shop prices), only when it differs from live. */
  variants?: VariantInputDTO[];
}

export interface ProductPendingChange {
  state: "in_review" | "sent_back";
  reason: string | null;
  submittedAt: string;
  proposed: ProductChangeProposal;
  /** null when images are not being changed. */
  media: ProductMedia[] | null;
}

export interface ProductMedia {
  id: string;
  url: string;
  storageKey: string;
  isPrimary: boolean;
  displayOrder: number;
  altText: string | null;
}

export interface ProductDetail {
  id: string;
  shopId: string;
  /** The home leaf. */
  primaryCategoryId: string;
  categoryName: string;
  categoryPath: string[];
  name: string;
  brand: string | null;
  currency: string;
  shortDescription: string;
  longDescription: string | null;
  gstStatus: GstStatus;
  storage: Storage;
  ageRestricted: boolean;
  /** The home leaf's resolved defaults for the three facts. */
  factDefaults: FactDefaults;
  /** How sizes are compared; null = no unit price. */
  unitBasis: UnitBasis | null;
  /** Every variant (active, inactive, removed); price, codes, weight and stock live on them. */
  options: OptionRow[];
  variants: VariantRow[];
  /** The shop's default low-stock threshold. */
  shopDefaultThreshold: number | null;
  status: ProductStatus;
  /** Values for the leaf's form; the product's option attributes are set through its options, not here. */
  details: DetailInput[];
  media: ProductMedia[];
  sections: string[];
  /** Required details still empty ("Allergens (Mango)" for one variant). */
  missingRequired: string[];
  /** On the response to a save only: details that no longer had a place (a new category, one variant left). */
  droppedDetails?: string[];
  createdAt: string;
  updatedAt: string;

  // Each variant carries the shop's and the customer's price; never Effy's margin as a figure.
  reviewState: ShopReviewState;
  reviewReason: string | null;
  hold: ProductHoldShown | null;
  createdBy: "shop" | "effy";
  approved: boolean;
  pendingChange: ProductPendingChange | null;
}

/** The parsed form, shared with Effy's own authoring (102). */
export type CreateProductInput = ProductContentInput;

export interface ListParams {
  page: number;
  pageSize: number;
  q: string | null;
  category: string | null;
  section: string | null;
  status: ProductStatus | null;
  /** By review state (e.g. everything sent back). */
  reviewState: ShopReviewState | null;
  priceMin: string | null;
  priceMax: string | null;
  /** Only products missing a required detail. */
  missing: boolean;
  sort: "name" | "price" | "recent";
  order: "asc" | "desc";
}

export interface FieldIssue {
  field: string;
  message: string;
}

// "forbidden" is distinct from "not_found": a manager-only refusal is 403.
export type ProductErrorKind = "validation" | "conflict" | "not_found" | "forbidden";

export class ProductError extends Error {
  constructor(
    readonly kind: ProductErrorKind,
    message: string,
    readonly fields?: FieldIssue[],
  ) {
    super(message);
    this.name = "ProductError";
  }
}

export function isProductError(err: unknown): err is ProductError {
  return err instanceof ProductError;
}
