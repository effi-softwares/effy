import type {
  CatalogSchemaDTO,
  CategoryDTO,
  ProductAttributeValueDTO,
  ProductDetailDTO,
  ProductListDTO,
  ProductListItemDTO,
  ProductMediaDTO,
  ProductStatus,
  ShopReviewState,
  ProductTypeAttributeDTO,
  ProductTypeDTO,
  ShopSectionDTO,
} from "@effy/shared-types"

export type CatalogSchema = CatalogSchemaDTO
export type ProductType = ProductTypeDTO
export type ProductTypeAttribute = ProductTypeAttributeDTO
export type Category = CategoryDTO
export type ProductListItem = ProductListItemDTO
export type ProductList = ProductListDTO
export type ProductDetail = ProductDetailDTO
export type ProductAttributeValue = ProductAttributeValueDTO
export type ProductMedia = ProductMediaDTO
export type ShopSection = ShopSectionDTO

export type ProductSort = "name" | "price" | "recent"
export type ProductOrder = "asc" | "desc"

export interface ProductListParams {
  page: number
  pageSize: number
  q?: string
  type?: string
  category?: string
  section?: string
  status?: ProductStatus
  reviewState?: ShopReviewState
  priceMin?: string
  priceMax?: string
  sort?: ProductSort
  order?: ProductOrder
}
