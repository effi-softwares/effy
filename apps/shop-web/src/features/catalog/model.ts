import type {
  CategoryFormDTO,
  ProductDetailDTO,
  ProductListDTO,
  ProductListItemDTO,
  ProductMediaDTO,
  ProductStatus,
  ShopReviewState,
  ShopSectionDTO,
  ShopTaxonomyCategoryDTO,
  ShopTaxonomyDTO,
} from "@effy/shared-types"

export type ShopTaxonomy = ShopTaxonomyDTO
export type ShopCategory = ShopTaxonomyCategoryDTO
export type CategoryForm = CategoryFormDTO
export type ProductListItem = ProductListItemDTO
export type ProductList = ProductListDTO
export type ProductDetail = ProductDetailDTO
export type ProductMedia = ProductMediaDTO
export type ShopSection = ShopSectionDTO

export type ProductSort = "name" | "price" | "recent"
export type ProductOrder = "asc" | "desc"

export interface ProductListParams {
  page: number
  pageSize: number
  q?: string
  /** A category id: products filed in it or beneath it. */
  category?: string
  section?: string
  status?: ProductStatus
  reviewState?: ShopReviewState
  /** Only products with a required detail empty. */
  missing?: boolean
  priceMin?: string
  priceMax?: string
  sort?: ProductSort
  order?: ProductOrder
}

/** "Dairy, Eggs & Fridge › Yoghurt" — the one way a category path is written. */
export const pathText = (path: readonly string[]) => path.join(" › ")
