/**
 * Shop product catalog contracts — 016-shop-product-catalog.
 *
 * The single source of truth (Principle II) for the catalog wire shapes across FOUR surfaces:
 *   - back-office web  → the schema-authority DTOs (product types, attributes, categories),
 *   - shop web + shop mobile → the shop-facing DTOs (catalog schema-read, products, media, sections),
 *   - both backends (apis/edge-api/admin `catalog/`, apis/edge-api/shop `products|sections`).
 *
 * The shop-facing subset is additionally REGENERATED to Kotlin for `apps/shop-mobile`
 * (packages/shared-types/catalog-shop-contract.ts is the codegen entry; see gen-kotlin-*-contract).
 * Admin-only schema-authoring DTOs are NOT part of the mobile contract.
 *
 * Data design: see specs/016-shop-product-catalog/data-model.md.
 * Enum unions mirror the SQL `text CHECK` sets exactly; every enum has a tolerant-reader narrowing
 * helper (the `toShopRoles` pattern) so a value the back office adds later maps to nothing here
 * rather than throwing (docs/api/versioning-policy.md rule 4).
 */
import type { PagedDTO } from "./shop";

export type { PagedDTO };

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Enums (mirror the SQL CHECK sets)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Product lifecycle. `draft` → `active` (publish) ↔ `unavailable`; any → `archived` (soft remove). */
export type ProductStatus = "draft" | "active" | "unavailable" | "archived";
export const PRODUCT_STATUSES: readonly ProductStatus[] = [
  "draft",
  "active",
  "unavailable",
  "archived",
];

/** The data type of a back-office-authored attribute — drives the form input + value column. */
export type AttributeDataType =
  | "short_text"
  | "long_text"
  | "number"
  | "boolean"
  | "single_select"
  | "multi_select";
export const ATTRIBUTE_DATA_TYPES: readonly AttributeDataType[] = [
  "short_text",
  "long_text",
  "number",
  "boolean",
  "single_select",
  "multi_select",
];

/** Lifecycle for the managed schema entities (product types, attributes, categories). */
export type SchemaStatus = "active" | "retired";
export const SCHEMA_STATUSES: readonly SchemaStatus[] = ["active", "retired"];

/** Narrow an arbitrary status string to a known ProductStatus, else null (tolerant reader). */
export function toProductStatus(input: string | null | undefined): ProductStatus | null {
  return input && (PRODUCT_STATUSES as readonly string[]).includes(input)
    ? (input as ProductStatus)
    : null;
}

/** Narrow an arbitrary data-type string to a known AttributeDataType, else null (tolerant reader). */
export function toAttributeDataType(input: string | null | undefined): AttributeDataType | null {
  return input && (ATTRIBUTE_DATA_TYPES as readonly string[]).includes(input)
    ? (input as AttributeDataType)
    : null;
}

/** Narrow an arbitrary status string to a known SchemaStatus, else null (tolerant reader). */
export function toSchemaStatus(input: string | null | undefined): SchemaStatus | null {
  return input && (SCHEMA_STATUSES as readonly string[]).includes(input)
    ? (input as SchemaStatus)
    : null;
}

/** Optional per-attribute validation envelope (jsonb `validation`). All fields optional. */
export interface AttributeValidationDTO {
  min?: number | null;
  max?: number | null;
  maxLength?: number | null;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Schema-authority DTOs (back-office; NOT in the mobile contract)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** An option for a select-typed attribute. */
export interface AttributeAllowedValueDTO {
  id: string;
  value: string;
  label: string;
  displayOrder: number;
}

/** A reusable attribute definition (the library the back office curates). */
export interface AttributeDefinitionDTO {
  id: string;
  key: string;
  name: string;
  dataType: AttributeDataType;
  unit: string | null;
  helpText: string | null;
  validation: AttributeValidationDTO | null;
  status: SchemaStatus;
  allowedValues: AttributeAllowedValueDTO[];
  createdAt: string;
  updatedAt: string;
}

/** An attribute assigned to a product type (the join, carrying the per-type facts). */
export interface ProductTypeAttributeDTO {
  attributeId: string;
  key: string;
  name: string;
  dataType: AttributeDataType;
  unit: string | null;
  helpText: string | null;
  validation: AttributeValidationDTO | null;
  allowedValues: AttributeAllowedValueDTO[];
  isMandatory: boolean;
  displayOrder: number;
  groupLabel: string | null;
}

/** A back-office product classification, with its assigned attributes. */
export interface ProductTypeDTO {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: SchemaStatus;
  attributes: ProductTypeAttributeDTO[];
  createdAt: string;
  updatedAt: string;
}

/** A node in the platform category taxonomy (flat list; the tree is built client-side via parentId). */
export interface CategoryDTO {
  id: string;
  parentId: string | null;
  key: string;
  name: string;
  displayOrder: number;
  status: SchemaStatus;
}

// ── Schema-authority request bodies ────────────────────────────────────────────────────────────

export interface CreateProductTypeRequest {
  key: string;
  name: string;
  description?: string | null;
}

export interface UpdateProductTypeRequest {
  name?: string;
  description?: string | null;
}

export interface AssignAttributeRequest {
  attributeId: string;
  isMandatory?: boolean;
  displayOrder?: number;
  groupLabel?: string | null;
}

export interface UpdateAssignmentRequest {
  isMandatory?: boolean;
  displayOrder?: number;
  groupLabel?: string | null;
}

export interface CreateAttributeDefinitionRequest {
  key: string;
  name: string;
  dataType: AttributeDataType;
  unit?: string | null;
  helpText?: string | null;
  validation?: AttributeValidationDTO | null;
  allowedValues?: { value: string; label: string; displayOrder?: number }[];
}

export interface UpdateAttributeDefinitionRequest {
  name?: string;
  unit?: string | null;
  helpText?: string | null;
  validation?: AttributeValidationDTO | null;
  allowedValues?: { value: string; label: string; displayOrder?: number }[];
}

export interface CreateCategoryRequest {
  key: string;
  name: string;
  parentId?: string | null;
  displayOrder?: number;
}

export interface UpdateCategoryRequest {
  name?: string;
  parentId?: string | null;
  displayOrder?: number;
}

/** Retire/activate a schema entity (product type, attribute, category). */
export interface ChangeSchemaStatusRequest {
  status: SchemaStatus;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Shop-facing DTOs (shop web + shop mobile; regenerated to Kotlin)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** One call bootstraps the create form: the active types (each with their assigned attributes)
 *  and the active category tree (flat, parentId-linked). */
export interface CatalogSchemaDTO {
  productTypes: ProductTypeDTO[];
  categories: CategoryDTO[];
}

/** A thin row in the shop catalog table (backend-paginated). */
export interface ProductListItemDTO {
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

/** A typed attribute value on a product (EAV, one value shape per data type). */
export interface ProductAttributeValueDTO {
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

/** A media object on a product (list/detail carry short-lived presigned GET urls). */
export interface ProductMediaDTO {
  id: string;
  url: string;
  storageKey: string;
  isPrimary: boolean;
  displayOrder: number;
  altText: string | null;
}

/** Full product detail. `updatedAt` is the optimistic-concurrency token (FR-023a);
 *  `missingMandatoryAttributes` is the non-blocking schema-drift notice (FR-020a). */
export interface ProductDetailDTO {
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
  attributes: ProductAttributeValueDTO[];
  media: ProductMediaDTO[];
  sections: string[];
  missingMandatoryAttributes: string[];
  createdAt: string;
  updatedAt: string;
}

/** A value supplied for one attribute on create/edit (only the field matching the data type is set). */
export interface AttributeValueInputDTO {
  attributeId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueOptions?: string[] | null;
}

/** POST /shop/v1/products — create a shop-owned product. `brand` is a first-class column (FR-010a). */
export interface CreateProductRequest {
  productTypeId: string;
  primaryCategoryId: string;
  name: string;
  sku?: string | null;
  gtin?: string | null;
  brand?: string | null;
  priceAmount: string;
  compareAtAmount?: string | null;
  shortDescription: string;
  longDescription?: string | null;
  attributes?: AttributeValueInputDTO[];
  sectionIds?: string[];
  primaryMediaStorageKey?: string | null;
  media?: { storageKey: string; isPrimary?: boolean; altText?: string | null; displayOrder?: number }[];
}

/** PATCH /shop/v1/products/{id} — focused edit. All content fields optional (a subset is patched);
 *  `expectedUpdatedAt` is REQUIRED (optimistic concurrency — a stale value → 409, FR-023a). */
export interface UpdateProductRequest {
  expectedUpdatedAt: string;
  name?: string;
  productTypeId?: string;
  primaryCategoryId?: string;
  sku?: string | null;
  gtin?: string | null;
  brand?: string | null;
  priceAmount?: string;
  compareAtAmount?: string | null;
  shortDescription?: string;
  longDescription?: string | null;
  attributes?: AttributeValueInputDTO[];
}

/** POST /shop/v1/products/{id}/status — lifecycle transition. */
export interface ChangeProductStatusRequest {
  status: ProductStatus;
}

/** POST /shop/v1/products/{id}/media — request a presigned direct-to-S3 upload. */
export interface CreatePresignedUploadRequest {
  contentType: string;
  fileSize: number;
}

export interface CreatePresignedUploadResponse {
  uploadUrl: string;
  storageKey: string;
}

/** POST /shop/v1/products/{id}/media/register — record an uploaded object. */
export interface RegisterMediaRequest {
  storageKey: string;
  isPrimary?: boolean;
  altText?: string | null;
  displayOrder?: number;
}

/** PATCH /shop/v1/products/{id}/media/{mediaId} — reorder / set primary / alt text. */
export interface UpdateMediaRequest {
  isPrimary?: boolean;
  displayOrder?: number;
  altText?: string | null;
}

/** PATCH /shop/v1/products/{id}/sections — set a product's section membership. */
export interface SetProductSectionsRequest {
  sectionIds: string[];
}

/** A shop-local section (grouping; Uber-Eats-style menu section). */
export interface ShopSectionDTO {
  id: string;
  name: string;
  displayOrder: number;
}

export interface CreateShopSectionRequest {
  name: string;
  displayOrder?: number;
}

export interface UpdateShopSectionRequest {
  name?: string;
  displayOrder?: number;
}

/** Paged product list envelope. Structurally a `PagedDTO<ProductListItemDTO>` but declared
 *  concretely (not a generic alias) so the Kotlin contract generator can name it. */
export interface ProductListDTO {
  items: ProductListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}
