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
}

/** See `REVIEW_STATE_SQL` in repository.ts. */
export type ShopReviewState =
  | "draft"
  | "in_review"
  | "sent_back"
  | "live"
  | "live_change_pending"
  | "live_change_sent_back";

/** Only the details that differ from the live product. */
export interface ProductChangeProposal {
  name?: string;
  shortDescription?: string;
  longDescription?: string | null;
  brand?: string | null;
  primaryCategoryId?: string;
  productTypeId?: string;
  gstStatus?: GstStatus;
  attributes?: AttributeValueInput[];
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
  /** null until classified. */
  gstStatus: GstStatus | null;
  /** How sizes are compared; null = no unit price. */
  unitBasis: UnitBasis | null;
  /** Every variant (active, inactive, removed); price, codes, weight and stock live on them. */
  options: OptionRow[];
  variants: VariantRow[];
  /** The shop's default low-stock threshold. */
  shopDefaultThreshold: number | null;
  status: ProductStatus;
  attributes: ProductAttributeValue[];
  media: ProductMedia[];
  sections: string[];
  missingMandatoryAttributes: string[];
  createdAt: string;
  updatedAt: string;

  // Each variant carries the shop's and the customer's price; never Effy's margin as a figure.
  reviewState: ShopReviewState;
  reviewReason: string | null;
  approved: boolean;
  pendingChange: ProductPendingChange | null;
}

/** Only the field matching the data type is meaningful. */
export interface AttributeValueInput {
  attributeId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueOptions?: string[] | null;
}

export interface CreateProductInput {
  productTypeId: string;
  primaryCategoryId: string;
  name: string;
  brand: string | null;
  shortDescription: string;
  longDescription: string | null;
  gstStatus: GstStatus;
  unitBasis: UnitBasis | null;
  /** Validated by `validateVariantSet` inside `applyVariantSet`. */
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
  /** By review state (e.g. everything sent back). */
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
