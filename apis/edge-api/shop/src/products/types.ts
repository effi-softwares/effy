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
  status: ProductStatus;
  attributes: ProductAttributeValue[];
  media: ProductMedia[];
  sections: string[];
  missingMandatoryAttributes: string[];
  createdAt: string;
  updatedAt: string;
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
  priceMin: string | null;
  priceMax: string | null;
  sort: "name" | "price" | "recent";
  order: "asc" | "desc";
}

export interface FieldIssue {
  field: string;
  message: string;
}

export type ProductErrorKind = "validation" | "conflict" | "not_found";

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
