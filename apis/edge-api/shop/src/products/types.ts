// Domain types for the shop product catalog (016). Wire DTOs live in @effy/shared-types and are
// mapped explicitly in handler-support; these are the internal domain shapes and never leak wire
// concerns (constitution Principle VI). Mirrors data-model.md §2.6–2.10 + §5.

export type ProductStatus = "draft" | "active" | "unavailable" | "archived";
export const PRODUCT_STATUSES: readonly ProductStatus[] = ["draft", "active", "unavailable", "archived"];

export type AttributeDataType =
  | "short_text"
  | "long_text"
  | "number"
  | "boolean"
  | "single_select"
  | "multi_select";

export interface AttributeValidation {
  min?: number | null;
  max?: number | null;
  maxLength?: number | null;
}

export interface AllowedValue {
  id: string;
  value: string;
  label: string;
  displayOrder: number;
}

// ── Catalog schema (read-only projection of the back-office-managed schema) ────────────────────

export interface SchemaAttribute {
  attributeId: string;
  key: string;
  name: string;
  dataType: AttributeDataType;
  unit: string | null;
  helpText: string | null;
  validation: AttributeValidation | null;
  allowedValues: AllowedValue[];
  isMandatory: boolean;
  displayOrder: number;
  groupLabel: string | null;
}

export interface SchemaProductType {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: "active" | "retired";
  attributes: SchemaAttribute[];
  createdAt: string;
  updatedAt: string;
}

export interface SchemaCategory {
  id: string;
  parentId: string | null;
  key: string;
  name: string;
  displayOrder: number;
  status: "active" | "retired";
}

export interface CatalogSchema {
  productTypes: SchemaProductType[];
  categories: SchemaCategory[];
}

// ── Products ────────────────────────────────────────────────────────────────────────────────────

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
  typeName: string;
  categoryName: string;
  priceAmount: string;
  currency: string;
  status: ProductStatus;
  sku: string | null;
  updatedAt: string;
  /** 067 — where the product stands with Effy's review. */
  reviewState: ShopReviewState;
  /** 067 — what CUSTOMERS pay. `priceAmount` above is what the shop is paid. */
  customerPriceAmount: string;
}

/** 067 — the six review states a shop is shown (see `REVIEW_STATE_SQL` in repository.ts). */
export type ShopReviewState =
  | "draft"
  | "in_review"
  | "sent_back"
  | "live"
  | "live_change_pending"
  | "live_change_sent_back";

/** 067 — what a pending change proposes: only the details that DIFFER from the live product. */
export interface ProductChangeProposal {
  name?: string;
  shortDescription?: string;
  longDescription?: string | null;
  brand?: string | null;
  sku?: string | null;
  gtin?: string | null;
  primaryCategoryId?: string;
  productTypeId?: string;
  /** The proposed SHOP price. */
  priceAmount?: string;
  compareAtAmount?: string | null;
  weightGrams?: number;
  attributes?: AttributeValueInput[];
}

export interface ProductPendingChange {
  state: "in_review" | "sent_back";
  reason: string | null;
  submittedAt: string;
  proposed: ProductChangeProposal;
  /** The complete proposed image set, or null when images are not being changed. */
  media: ProductMedia[] | null;
}

export interface ProductAttributeValue {
  attributeId: string;
  key: string;
  name: string;
  dataType: AttributeDataType;
  unit: string | null;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueOptions: string[] | null;
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
  productTypeId: string;
  typeName: string;
  primaryCategoryId: string;
  categoryName: string;
  name: string;
  sku: string | null;
  gtin: string | null;
  brand: string | null;
  priceAmount: string;
  currency: string;
  compareAtAmount: string | null;
  shortDescription: string;
  longDescription: string | null;
  /** Shipping weight in grams (032) — what delivery is priced from. */
  weightGrams: number;
  /** ⚠ TRUE = the platform default is in use; nobody has measured it (FR-037a). */
  weightIsAssumed: boolean;
  status: ProductStatus;
  attributes: ProductAttributeValue[];
  media: ProductMedia[];
  sections: string[];
  missingMandatoryAttributes: string[];
  createdAt: string;
  updatedAt: string;

  // ── 067 ──────────────────────────────────────────────────────────────────────────────────────
  // ⚠ `priceAmount` / `compareAtAmount` above are the SHOP's prices — what this audience entered and
  // is paid. The customer's are below. Nothing here carries Effy's margin as a figure (FR-039).
  reviewState: ShopReviewState;
  reviewReason: string | null;
  customerPriceAmount: string;
  customerCompareAtAmount: string | null;
  /** True once Effy has approved this product at least once. */
  approved: boolean;
  pendingChange: ProductPendingChange | null;
}

/** A typed value supplied for one attribute (only the field matching the data type is meaningful). */
export interface AttributeValueInput {
  attributeId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueOptions?: string[] | null;
}

/** Normalised, validated create input (service → repository). */
export interface CreateProductInput {
  productTypeId: string;
  primaryCategoryId: string;
  name: string;
  sku: string | null;
  gtin: string | null;
  brand: string | null;
  priceAmount: string;
  compareAtAmount: string | null;
  shortDescription: string;
  longDescription: string | null;
  /**
   * ⚠ NULL means "not supplied" and the column default (an assumption) stands. It does NOT mean zero
   * — a zero-weight product is free-delivery-by-arithmetic, which the CHECK constraint refuses.
   */
  weightGrams: number | null;
  attributes: AttributeValueInput[];
  sectionIds: string[];
  media: { storageKey: string; isPrimary: boolean; altText: string | null; displayOrder: number }[];
}

export interface ListParams {
  page: number;
  pageSize: number;
  q: string | null;
  type: string | null;
  category: string | null;
  section: string | null;
  status: ProductStatus | null;
  /** 067 — filter by review state (e.g. everything Effy sent back). */
  reviewState: ShopReviewState | null;
  priceMin: string | null;
  priceMax: string | null;
  sort: "name" | "price" | "recent";
  order: "asc" | "desc";
}

export interface FieldIssue {
  field: string;
  message: string;
}

// ⚠ 057 added "forbidden". A manager-only refusal is 403, and folding it into "not_found" (the
// tempting shortcut) would be wrong in BOTH directions: it tells an authorised operator their own team
// does not exist, and it tells an unauthorised one that a resource is absent rather than off-limits.
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
