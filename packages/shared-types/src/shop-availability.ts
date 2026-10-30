import type { ListPage } from "./list"
/**
 * Availability (099): every size a shop sells, its stock and whether it is on sale - one quick screen
 * to take a size off sale in one tap. Read only: the switch is the existing variant state route
 * (`POST /shop/v1/products/{id}/variants/{variantId}/state`), immediate and never reviewed.
 */
import type { WireInt } from "./cart"
import type { ProductStockDTO } from "./inventory"

/** "Needs a look" is out of stock or low; "all" is everything. */
export const AVAILABILITY_FILTERS = ["needs_look", "out_of_stock", "low_stock", "off_sale", "all"] as const
export type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number]

export interface ShopAvailabilityQuery {
  q?: string
  filter?: AvailabilityFilter
  /** The previous page's `next`. */
  after?: string
  /** 1–100; 50 when absent. */
  limit?: WireInt
}

/** One size of a live or unavailable product. */
export interface ShopAvailabilityRowDTO {
  productId: string
  productName: string
  brand: string | null
  productStatus: "active" | "unavailable"
  variantId: string
  /** The size as sold ("1 kg"); null for a product sold one way. */
  label: string | null
  /** Effy's code for the size (V + 6). */
  code: string
  sku: string | null
  gtin: string | null
  onSale: boolean
  /** The product's only size on sale: switching it off is refused - make the product unavailable instead. */
  lastOnSale: boolean
  stock: ProductStockDTO
  imageUrl: string | null
}

/** A console list page (103) with every view's count. */
export interface ShopAvailabilityDTO extends ListPage<ShopAvailabilityRowDTO> {
  /** Under the search, before the filter. */
  counts: { needsLook: WireInt; outOfStock: WireInt; lowStock: WireInt; offSale: WireInt; all: WireInt }
}
