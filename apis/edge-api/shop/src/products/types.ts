// Domain types for the shop product catalog (016). Wire DTOs live in @effy/shared-types and are
// mapped explicitly in handler-support; these are the internal domain shapes and never leak wire
// concerns (constitution Principle VI). Mirrors data-model.md §2.6–2.10 + §5.

import type { OptionRow, VariantRow } from "@effy/edge-shared/catalog";
import type { GstStatus, OptionInputDTO, UnitBasis, VariantInputDTO } from "@effy/shared-types";

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
  /** 098 — the LOWEST shop price among active variants. */
  priceAmount: string;
  currency: string;
  status: ProductStatus;
  updatedAt: string;
  /** 067 — where the product stands with Effy's review. */
  reviewState: ShopReviewState;
  /** 067/098 — the lowest CUSTOMER price among active variants; null until first approved. */
  customerPriceAmount: string | null;
  /** 098 — active variants' shop prices differ. */
  priceVaries: boolean;
  /** 098 — variants that are not removed. */
  variantCount: number;
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
  primaryCategoryId?: string;
  productTypeId?: string;
  /** 096 */
  gstStatus?: GstStatus;
  attributes?: AttributeValueInput[];
  /** 098 */
  unitBasis?: UnitBasis | null;
  /** 098 — the COMPLETE proposed option set; present only when it differs from live. */
  options?: OptionInputDTO[];
  /** 098 — the COMPLETE proposed variant set (SHOP prices); present only when it differs from live. */
  variants?: VariantInputDTO[];
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
  brand: string | null;
  currency: string;
  shortDescription: string;
  longDescription: string | null;
  /** 096 — null for a product made before 096 and not yet classified. */
  gstStatus: GstStatus | null;
  /** 098 — how sizes are compared; null = no unit price. */
  unitBasis: UnitBasis | null;
  /** 098 — the options and every variant (active, inactive, removed). Price, codes, weight and stock live on the variants. */
  options: OptionRow[];
  variants: VariantRow[];
  /** 098 — the shop's default low-stock threshold, for each variant's stock state. */
  shopDefaultThreshold: number | null;
  status: ProductStatus;
  attributes: ProductAttributeValue[];
  media: ProductMedia[];
  sections: string[];
  missingMandatoryAttributes: string[];
  createdAt: string;
  updatedAt: string;

  // ── 067 ──────────────────────────────────────────────────────────────────────────────────────
  // ⚠ Each variant carries the SHOP's prices and the customer's. Nothing here carries Effy's margin as
  // a figure (FR-039).
  reviewState: ShopReviewState;
  reviewReason: string | null;
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
  brand: string | null;
  shortDescription: string;
  longDescription: string | null;
  gstStatus: GstStatus;
  /** 098 */
  unitBasis: UnitBasis | null;
  /** 098 — validated by `validateVariantSet` inside the one writer (`applyVariantSet`). */
  options: OptionInputDTO[];
  variants: VariantInputDTO[];
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
