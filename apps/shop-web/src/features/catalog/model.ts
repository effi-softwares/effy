import type {
  AttributeValueInputDTO,
  CatalogSchemaDTO,
  CategoryDTO,
  ChangeProductStatusRequest,
  CreatePresignedUploadRequest,
  CreatePresignedUploadResponse,
  CreateProductRequest,
  CreateShopSectionRequest,
  ProductAttributeValueDTO,
  ProductDetailDTO,
  ProductListDTO,
  ProductListItemDTO,
  ProductMediaDTO,
  ProductStatus,
  ProductTypeAttributeDTO,
  ProductTypeDTO,
  RegisterMediaRequest,
  SetProductSectionsRequest,
  ShopSectionDTO,
  UpdateMediaRequest,
  UpdateProductRequest,
  UpdateShopSectionRequest,
} from "@effy/shared-types";

/**
 * Domain shapes for shop-web catalog (016, US2/US3).
 *
 * The wire DTOs (already written in @effy/shared-types) double as the domain shapes here — they
 * carry no wire-only encoding to strip. Reads/writes still route through the repo layer
 * (Principle VI), so if a DTO and its domain model ever diverge, only the repo changes.
 */
export type CatalogSchema = CatalogSchemaDTO;
export type ProductType = ProductTypeDTO;
export type ProductTypeAttribute = ProductTypeAttributeDTO;
export type Category = CategoryDTO;
export type ProductListItem = ProductListItemDTO;
export type ProductList = ProductListDTO;
export type ProductDetail = ProductDetailDTO;
export type ProductAttributeValue = ProductAttributeValueDTO;
export type ProductMedia = ProductMediaDTO;
export type ShopSection = ShopSectionDTO;

export type {
  AttributeValueInputDTO,
  ChangeProductStatusRequest,
  CreatePresignedUploadRequest,
  CreatePresignedUploadResponse,
  CreateProductRequest,
  CreateShopSectionRequest,
  RegisterMediaRequest,
  SetProductSectionsRequest,
  UpdateMediaRequest,
  UpdateProductRequest,
  UpdateShopSectionRequest,
};

/** Server-computed sort key for the catalog table (contract `sort`). */
export type ProductSort = "name" | "price" | "recent";
export type ProductOrder = "asc" | "desc";

/**
 * Query params for the catalog table (server owns pagination + filter + search + sort — FR-017).
 * `type`/`category`/`section` are ids; `status` is a ProductStatus; prices are decimal strings so
 * they survive the round-trip without float drift.
 */
export interface ProductListParams {
  page: number;
  pageSize: number;
  q?: string;
  type?: string;
  category?: string;
  section?: string;
  status?: ProductStatus;
  priceMin?: string;
  priceMax?: string;
  sort?: ProductSort;
  order?: ProductOrder;
}
