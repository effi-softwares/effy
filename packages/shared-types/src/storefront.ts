/**
 * Customer storefront (public read) contracts — 019-customer-commerce-flow.
 *
 * The single source of truth (Principle II) for the customer-facing catalog read shapes served by the
 * hot path (apis/core-api `storefront` feature) and consumed by customer-web + (regenerated to Kotlin)
 * customer-mobile. These are the CUSTOMER projection of the 016 catalog: they carry NO shop identity
 * and NO internal fields — shops are hidden fulfillment nodes (FR-038).
 *
 * Money is a decimal STRING + a `currency` field (matches catalog.ts / R9). Image URLs are short-lived
 * presigned S3 GET URLs minted by core-api (R7). Every enum has a tolerant-reader narrowing helper so a
 * value the back office adds later maps to nothing here rather than throwing (versioning-policy rule 4).
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §3.
 */

/** A badge shown on a product card. Derived server-side (on_sale = has compare-at; new = newest). */
export type ProductBadge = "on_sale" | "new";
export const PRODUCT_BADGES: readonly ProductBadge[] = ["on_sale", "new"];

/** Narrow an arbitrary server string to a known badge, dropping the unknown (tolerant reader). */
export function toProductBadges(values: readonly string[] | null | undefined): ProductBadge[] {
  if (!values) return [];
  return values.filter((v): v is ProductBadge => (PRODUCT_BADGES as readonly string[]).includes(v));
}

/** A product image (presigned GET URL + alt text). */
export interface MediaDTO {
  imageUrl: string;
  alt: string | null;
}

/** The at-a-glance product card used in rails, search results, favorites and recently-viewed. */
export interface StorefrontProductCardDTO {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  priceAmount: string;
  currency: string;
  compareAtAmount: string | null;
  badges: ProductBadge[];
  available: boolean;
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
}

/** A merchandising rail on Home (Featured / On-sale / a category rail). */
export interface StorefrontRailDTO {
  key: string;
  title: string;
  products: StorefrontProductCardDTO[];
}

/** A promotional hero banner. Minimal/derived in this slice (no CMS). */
export interface BannerDTO {
  key: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string | null;
}

/** The composed Home payload (GET /v1/storefront/home). */
export interface StorefrontHomeDTO {
  banners: BannerDTO[];
  rails: StorefrontRailDTO[];
}

/** A browse/filter category, customer projection (GET /v1/storefront/categories). Distinct from the
 * admin/shop `CategoryDTO` in catalog.ts — this carries no internal id/status/order. */
export interface StorefrontCategoryDTO {
  key: string;
  name: string;
  parentKey: string | null;
}

/** Search/browse query params (facets are query params, never path segments — SEO, FR-017). */
export interface ProductSearchQuery {
  q?: string;
  categoryKey?: string;
  minPrice?: string;
  maxPrice?: string;
  saleOnly?: boolean;
  /** Attribute facets, keyed by attribute key → selected value(s). */
  attributes?: Record<string, string>;
  cursor?: string;
  limit?: number;
}

/** A page of search results with a keyset cursor for infinite scroll. */
export interface ProductSearchResultDTO {
  items: StorefrontProductCardDTO[];
  nextCursor: string | null;
}
