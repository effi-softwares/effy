/**
 * Product catalog contracts: the schema-authority DTOs back-office edits (product types, attributes,
 * categories) and the shop-facing DTOs (products, media, sections), served by the admin and shop
 * services. Enum unions mirror the SQL check sets.
 */
import type { GstStatus } from "./documents";
import type { PagedDTO } from "./shop";
import type { UnitBasis } from "./unit-price";
import type { OptionDTO, OptionInputDTO, ShopVariantDTO, VariantInputDTO } from "./variants";

export type { PagedDTO };

// Enums (mirror the SQL check sets)

/** Product lifecycle: `draft` → `active` (publish) ↔ `unavailable`; any → `archived` (soft remove). */
export type ProductStatus = "draft" | "active" | "unavailable" | "archived";
export const PRODUCT_STATUSES: readonly ProductStatus[] = [
  "draft",
  "active",
  "unavailable",
  "archived",
];

/** The data type of an attribute: drives the form input and the value column. */
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

/** Lifecycle of the managed schema entities. */
export type SchemaStatus = "active" | "retired";
export const SCHEMA_STATUSES: readonly SchemaStatus[] = ["active", "retired"];

/** Optional per-attribute validation (jsonb `validation`). */
export interface AttributeValidationDTO {
  min?: number | null;
  max?: number | null;
  maxLength?: number | null;
}

// Schema-authority DTOs (back-office)

/** An option for a select-typed attribute. */
export interface AttributeAllowedValueDTO {
  id: string;
  value: string;
  label: string;
  displayOrder: number;
}

/** A reusable attribute definition. */
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

/** An attribute assigned to a product type, with the per-type facts. */
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

/** A product classification, with its assigned attributes. */
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

/** A category node (a flat list; the tree is built from parentId). */
export interface CategoryDTO {
  id: string;
  parentId: string | null;
  key: string;
  name: string;
  displayOrder: number;
  status: SchemaStatus;
}

// Schema-authority request bodies

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

// Shop-facing DTOs

/** Bootstraps the create form: the active types with their attributes, and the active category list. */
export interface CatalogSchemaDTO {
  productTypes: ProductTypeDTO[];
  categories: CategoryDTO[];
}

/** A row in the shop catalog table (server-paginated). */
export interface ProductListItemDTO {
  id: string;
  name: string;
  brand: string | null;
  primaryImageUrl: string | null;
  typeName: string;
  categoryName: string;
  /** The lowest shop price among active variants (say "From" when `priceVaries`); equals `shopPriceAmount`. */
  priceAmount: string;
  currency: string;
  status: ProductStatus;
  updatedAt: string;
  /** Where the product stands with Effy's review. */
  reviewState?: ShopReviewState;
  /** The lowest shop price among active variants. */
  shopPriceAmount?: string;
  /** The lowest customer price among active variants; null until first approved. */
  customerPriceAmount?: string | null;
  /** Active variants' prices differ. */
  priceVaries: boolean;
  /** Variants that are not removed. */
  variantCount: number;
}

/** A typed attribute value (EAV, one value shape per data type). */
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

/** A media object on a product (lists and detail carry short-lived presigned GET URLs). */
export interface ProductMediaDTO {
  id: string;
  url: string;
  storageKey: string;
  isPrimary: boolean;
  displayOrder: number;
  altText: string | null;
}

/** Full product detail. `updatedAt` is the optimistic-concurrency token; `missingMandatoryAttributes`
 *  is a non-blocking notice. */
export interface ProductDetailDTO {
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
  /** Taxable or GST-free; null until classified. */
  gstStatus: GstStatus | null;
  /** How this product's sizes are compared (unit pricing); null = no unit price. */
  unitBasis: UnitBasis | null;
  /** Up to two options ("Size", "Flavour") with their values in the shop's order; empty with no options. */
  options: OptionDTO[];
  /**
   * Every variant (active, inactive, then removed), in display order. Price, codes, weight, pack size
   * and stock live here; a product has none of its own.
   */
  variants: ShopVariantDTO[];
  status: ProductStatus;
  attributes: ProductAttributeValueDTO[];
  media: ProductMediaDTO[];
  sections: string[];
  missingMandatoryAttributes: string[];
  createdAt: string;
  updatedAt: string;

  // Review. Nothing here names or derives from Effy's margin: a shop sees what it is paid and what the
  // customer pays.
  reviewState?: ShopReviewState;
  /** Why Effy last sent this product (or its pending change) back. Carries no staff identity. */
  reviewReason?: string | null;
  /** The shop's proposed new version of an approved product, or null. Customers see the fields above until it is approved. */
  pendingChange?: ProductPendingChangeDTO | null;
}

/**
 * Where a product stands with Effy's review, from two facts: whether it was ever approved, and whether
 * something is waiting. "live" means approved; whether it is on sale is `status`.
 */
export type ShopReviewState =
  | "draft"
  | "in_review"
  | "sent_back"
  | "live"
  | "live_change_pending"
  | "live_change_sent_back";

/** What a pending change proposes: only the details that differ from the live product. */
export interface ProductChangeProposalDTO {
  name?: string;
  shortDescription?: string;
  longDescription?: string | null;
  brand?: string | null;
  primaryCategoryId?: string;
  productTypeId?: string;
  gstStatus?: GstStatus;
  attributes?: AttributeValueInputDTO[];
  unitBasis?: UnitBasis | null;
  /** The complete proposed option set, only when it differs from live. */
  options?: OptionInputDTO[];
  /** The complete proposed variant set (shop prices), only when it differs; a live variant missing from it is removed on approval. */
  variants?: VariantInputDTO[];
}

export interface ProductPendingChangeDTO {
  state: "in_review" | "sent_back";
  reason: string | null;
  submittedAt: string;
  proposed: ProductChangeProposalDTO;
  /** The complete proposed image set, or null when unchanged. */
  media: ProductMediaDTO[] | null;
}

/** A value for one attribute on create/edit (only the field matching the data type is set). */
export interface AttributeValueInputDTO {
  attributeId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueOptions?: string[] | null;
}

/** POST /shop/v1/products: create a shop-owned product. */
export interface CreateProductRequest {
  productTypeId: string;
  primaryCategoryId: string;
  name: string;
  brand?: string | null;
  shortDescription: string;
  longDescription?: string | null;
  /** Required: every product is taxable or GST-free from the start. */
  gstStatus: GstStatus;
  /** How sizes are compared; omit for no unit price. */
  unitBasis?: UnitBasis | null;
  /** 0 to 2 options. Ids are client-generated UUIDs. */
  options: OptionInputDTO[];
  /**
   * 1 to 50 variants; exactly one (with no option values) when there are no options. Each has its own
   * price, codes and shipping weight (omit a weight to record the platform default as an assumption).
   */
  variants: VariantInputDTO[];
  attributes?: AttributeValueInputDTO[];
  sectionIds?: string[];
  primaryMediaStorageKey?: string | null;
  media?: { storageKey: string; isPrimary?: boolean; altText?: string | null; displayOrder?: number }[];
}

/** PATCH /shop/v1/products/{id}: a focused edit of any subset of content fields. `expectedUpdatedAt`
 *  is required (a stale value is 409). */
export interface UpdateProductRequest {
  expectedUpdatedAt: string;
  name?: string;
  productTypeId?: string;
  primaryCategoryId?: string;
  brand?: string | null;
  shortDescription?: string;
  longDescription?: string | null;
  /** On a live product this is proposed and reviewed, like every other detail. */
  gstStatus?: GstStatus;
  attributes?: AttributeValueInputDTO[];
  unitBasis?: UnitBasis | null;
  /**
   * When present, both are the complete target sets, sent together: written as-is on a draft, part of the
   * pending change on a live product. Variant state has its own immediate route.
   */
  options?: OptionInputDTO[];
  variants?: VariantInputDTO[];
}

/** POST /shop/v1/products/{id}/status: a lifecycle transition. */
export interface ChangeProductStatusRequest {
  status: ProductStatus;
}

/** POST /shop/v1/products/{id}/media: request a presigned direct-to-S3 upload. */
export interface CreatePresignedUploadRequest {
  contentType: string;
  fileSize: number;
}

export interface CreatePresignedUploadResponse {
  uploadUrl: string;
  storageKey: string;
}

/** POST /shop/v1/products/{id}/media/register: record an uploaded object. */
export interface RegisterMediaRequest {
  storageKey: string;
  isPrimary?: boolean;
  altText?: string | null;
  displayOrder?: number;
}

/** PATCH /shop/v1/products/{id}/media/{mediaId}: reorder, set primary, alt text. */
export interface UpdateMediaRequest {
  isPrimary?: boolean;
  displayOrder?: number;
  altText?: string | null;
}

/** PATCH /shop/v1/products/{id}/sections: set a product's section membership. */
export interface SetProductSectionsRequest {
  sectionIds: string[];
}

/** A shop-local menu section. */
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

/** Paged product list, declared concretely (not a generic alias) so the Kotlin generator can name it. */
export interface ProductListDTO {
  items: ProductListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}
