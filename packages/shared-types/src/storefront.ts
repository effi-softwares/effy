import type { ProductOfferDTO } from "./promotions";

/**
 * Customer storefront contracts (the public catalogue read), served by the storefront service and used
 * by customer-web and the customer app. The customer projection of the catalogue: no shop identity and
 * no internal fields. Money is a decimal string plus `currency`.
 */

// `WireInt` is imported, so the generated Kotlin emits an Int.
import type { WireInt } from "./cart";
import type { UnitBasis, UnitPriceDTO } from "./unit-price";
import type { OptionDTO, StorefrontVariantDTO } from "./variants";

/** A badge on a product card, derived server-side (on_sale = has compare-at; new = newest). */
export type ProductBadge = "on_sale" | "new";
/** A product image: its permanent public address and alt text. */
export interface MediaDTO {
  imageUrl: string;
  /** Widths (px) of this picture's smaller copies, ascending; absent or [] means only `imageUrl`. Build each with `renditionUrl`. */
  imageWidths?: number[];
  alt: string | null;
}

/** The product card used in rails, search results, saved items and recently viewed. */
export interface StorefrontProductCardDTO {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /** Widths (px) of this picture's smaller copies, ascending; absent or [] means only `imageUrl`. Build each with `renditionUrl`. */
  imageWidths?: number[];
  /** The listing price: the lowest among active variants (say "From" when `priceVaries`). Selling out one size never moves it. */
  priceAmount: string;
  currency: string;
  /** The "was" price of the variant `priceAmount` came from. */
  compareAtAmount: string | null;
  badges: ProductBadge[];
  /** Some variant can be bought now (the one availability rule). */
  available: boolean;
  /** An item or buy-X-get-Y promotion open to everyone that covers this product. */
  offer?: ProductOfferDTO | null;
  /** Active variants' prices differ: show "From". */
  priceVaries: boolean;
  /** The variant this tile stands for (the one a stock-code or barcode search matched, else the default); quick-add adds it when `variantCount` is 1. */
  variantId: string;
  /** Active variants; above 1 the tile offers "Choose" instead of quick-add. */
  variantCount: WireInt;
  /** The comparison price of `priceAmount`, with a unit basis and a pack size. */
  unitPrice: UnitPriceDTO | null;
}

/** A labelled group of attribute rows on the product detail page (never laid out as cards). */
export interface ProductAttributeGroupDTO {
  groupLabel: string;
  items: { label: string; value: string }[];
}

/** Full product detail (gallery, description, grouped attributes, category path). */
export interface StorefrontProductDetailDTO extends StorefrontProductCardDTO {
  longDescription: string | null;
  gallery: MediaDTO[];
  attributes: ProductAttributeGroupDTO[];
  categoryPath: string[];
  /** The primary category's key, for the related-products rail (`categoryPath` carries display names,
   * which cannot be queried). */
  categoryKey: string;
  /** The product's options in the shop's order; empty when none (no selector). */
  options: OptionDTO[];
  /** Active variants only, in display order. */
  variants: StorefrontVariantDTO[];
  /** The variant to open on: the one the link named if active, else the first that can be bought, else the first. */
  defaultVariantId: string;
  unitBasis: UnitBasis | null;
}

/** A merchandising rail on Home (Featured / On-sale / a category rail). */
export interface StorefrontRailDTO {
  key: string;
  title: string;
  products: StorefrontProductCardDTO[];
}

/**
 * Where a promotion tile leads: a closed vocabulary (mobile has no URL router), mapped exhaustively by
 * each client; an unrecognised value renders the tile non-tappable.
 */
export type BannerTarget =
  | { kind: "search" }
  | { kind: "sale" }
  | { kind: "category"; categoryKey: string }
  | { kind: "product"; productId: string }
  | { kind: "promotion"; promotionId: string };

/**
 * One promotion in full, the destination of a tap (`GET /storefront/v1/promotions/{id}`). Served through
 * the same visibility rule as Home, so one that ended meanwhile is 404, not stale terms (hence uncached).
 */
export interface PromotionDTO {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  /** Widths (px) of this picture's smaller copies, ascending; absent or [] means only `imageUrl`. Build each with `renditionUrl`. */
  imageWidths?: number[];
  /** Non-nullable: a screen whose purpose is to hand over a code must have one. */
  code: string;
  /** The terms sentence, from the server-side composer. */
  terms: string | null;
  /** How long is left ("Ends in 3 days"), composed server-side; null when it never ends. */
  validity: string | null;
}

/** The composed Home payload (GET /storefront/v1/home). */
export interface StorefrontHomeDTO {
  rails: StorefrontRailDTO[];
}

/** A browse category, customer projection (GET /storefront/v1/categories); unlike catalog.ts's
 * `CategoryDTO` it carries no internal id, status or order. */
export interface StorefrontCategoryDTO {
  key: string;
  name: string;
  parentKey: string | null;
  /** Purchasable products in this category and everything under it, so an aisle's number is what its
   * page shows. */
  productCount: number;
  /** A representative image derived from a product in the category (categories store none), chosen
   * deterministically; null renders a brand tile. */
  imageUrl: string | null;
  /** Widths (px) of this picture's smaller copies, ascending; absent or [] means only `imageUrl`. Build each with `renditionUrl`. */
  imageWidths?: number[];
}

/**
 * One thing the search field offers:
 * - no `categorySlug`: search for `text`;
 * - `categorySlug` and a different `text`: search for `text` inside that aisle ("oat milk in Dairy & eggs");
 * - `text` equal to `categoryName`: the aisle itself; open it.
 */
export interface SearchPhraseDTO {
  text: string;
  categorySlug?: string;
  categoryName?: string;
}

/** Suggestions for the text typed so far (GET /storefront/v1/suggestions?q=), from the catalogue only, never other shoppers' searches. Empty under two characters. */
export interface SuggestionsDTO {
  /** At most five. */
  phrases: SearchPhraseDTO[];
  /** At most four, in the ordinary card shape. */
  products: StorefrontProductCardDTO[];
}

/** How a result set can be ordered. `relevance` needs a text query; without one the server uses
 * `newest` and says so in `ProductSearchResultDTO.sort`. */
export type ProductSort = "newest" | "price_asc" | "price_desc" | "relevance";

/** A page of results with a keyset cursor. `cursor` is opaque and sort-tagged: one from another
 * ordering is 400 `cursor_sort_mismatch`. */
export interface ProductSearchResultDTO {
  items: StorefrontProductCardDTO[];
  nextCursor: string | null;
  /** Total products matching the refinements, ignoring pagination. */
  total: number;
  /** The ordering actually applied (may differ from the request): render the sort control from this. */
  sort: ProductSort;
}

/** The control a facet drives:
 * `single_select` pick one (category; reuses the `categoryKey` filter).
 * `multi_select` tick many, OR within (brand, select and boolean attributes).
 * `toggle` on/off (offers).
 * A client meeting an unknown value renders nothing for that facet. */
export type FacetType = "single_select" | "multi_select" | "toggle";

/** One value within a facet, with its count in the current result set. Zero-count options are omitted, so `count` is ≥ 1. */
export interface FacetOptionDTO {
  value: string;
  label: string;
  /** `WireInt`, so the generated Kotlin reads an Int. */
  count: WireInt;
}

/** One refinable dimension: category, brand, an attribute key, or `offers`. */
export interface FacetDTO {
  /** `"category"`, `"brand"`, `"offers"`, or an attribute-definition key (e.g. `"diet"`). */
  key: string;
  label: string;
  type: FacetType;
  options: FacetOptionDTO[];
}

/** The facets for a query and its filters, with per-option counts. Computed on filter change, not per
 * page; `priceBounds` is null for an empty set. */
export interface FacetSetDTO {
  priceBounds: { min: string; max: string } | null;
  facets: FacetDTO[];
}

