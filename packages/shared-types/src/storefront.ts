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

// ⚠ IMPORTED, not redeclared. `WireInt` carries the `@asType integer` annotation that makes the
// generated Kotlin emit an Int rather than a Double — a second copy of the alias would be a second
// thing that can drift, which defeats the entire point of having it (027's `1.0` into a Go `int`).
import type { WireInt } from "./cart";

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
  /** The primary category's key — drives the related-products rail (025 FR-026). `categoryPath`
   * carries display NAMES, which cannot be used to query. */
  categoryKey: string;
}

/** A merchandising rail on Home (Featured / On-sale / a category rail). */
export interface StorefrontRailDTO {
  key: string;
  title: string;
  products: StorefrontProductCardDTO[];
}

/**
 * Where a promotional banner leads (028).
 *
 * ⚠ A CLOSED vocabulary, deliberately. `href` below is a WEB PATH, and mobile has no URL router —
 * inventing one to serve a banner would be the tail wagging the dog. A closed set the server promises
 * and each client maps exhaustively means a new target shows up as a gap in a `when`/`switch` at
 * compile time, and at runtime an unrecognised value renders the banner NON-TAPPABLE. A tap that does
 * nothing is worse than no tap.
 *
 * Every target is reachable elsewhere in the app (FR-034) — which is why no "promotion landing page"
 * exists. A destination only a banner can reach is unreachable for the majority who never see it.
 */
export type BannerTarget =
  | { kind: "search" }
  | { kind: "sale" }
  | { kind: "category"; categoryKey: string }
  | { kind: "product"; productId: string };

/**
 * A promotional banner on Home — the shopper-facing face of an advertised promotion (028).
 *
 * ⚠ Every field added in 028 is OPTIONAL, so `customer-web`'s existing consumer keeps typechecking
 * without an edit. What is NOT backward compatible is the LIST: this used to always contain one
 * derived "welcome" stub and is now empty whenever no promotion is advertised. Any layout that
 * assumed at least one banner has to handle `[]`.
 */
export interface BannerDTO {
  /** The promotion id. Stable across reads — clients use it as a list key. */
  key: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  /** Retained for `customer-web`. Mobile ignores it in favour of `target`. */
  href: string | null;
  /** The code a shopper types in the cart. Shown so the banner is actionable, not just decorative. */
  code?: string | null;
  /**
   * The condition sentence, e.g. `"On orders over $30"` — COMPOSED SERVER-SIDE from the promotion's
   * minimum, so both surfaces phrase one promotion identically. Null when it has no conditions.
   *
   * FR-037d: a shopper must learn of a condition from the banner or from where it leads — never
   * first at payment.
   */
  terms?: string | null;
  target?: BannerTarget | null;
  /**
   * Where this banner sits in Home's section sequence: 0 above the first section, n after the nth.
   *
   * ⚠ `WireInt`, NOT `number`. 027 lost days to Kotlin serialising a quantity as `Double`, the wire
   * carrying `1.0`, and Go's `encoding/json` refusing `1.0` into an `int` — while every unit test
   * passed, because the fakes spoke Kotlin at both ends and never crossed the wire. The fix was made
   * at the contract so the generated Kotlin cannot regress; this field takes the same treatment.
   */
  position?: WireInt;
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
  /** Active products in this category (025). Drives "N items" and the empty-category case. */
  productCount: number;
  /** Representative image, DERIVED from a product in the category — categories store no imagery, and
   * 025 FR-001 forbids adding a column for it. Null → the client renders a brand tile, never a broken
   * frame. The choice is deterministic so a category does not change its face between page loads. */
  imageUrl: string | null;
}

/** The orderings a result set can be presented in (025 FR-016).
 *
 * `relevance` is only meaningful alongside a text query; without one the server falls back to
 * `newest` and reports what it actually did in `ProductSearchResultDTO.sort`. */
export type ProductSort = "newest" | "price_asc" | "price_desc" | "relevance";

/** Search/browse query params (facets are query params, never path segments — SEO, FR-017). */
export interface ProductSearchQuery {
  q?: string;
  categoryKey?: string;
  minPrice?: string;
  maxPrice?: string;
  saleOnly?: boolean;
  /** Attribute facets, keyed by attribute key → selected value(s). */
  attributes?: Record<string, string>;
  /** Defaults to `newest`, which is the pre-025 ordering. */
  sort?: ProductSort;
  cursor?: string;
  limit?: number;
}

/** A page of search results with a keyset cursor for infinite scroll.
 *
 * ⚠ `cursor` is OPAQUE and sort-tagged. Do not construct one, and do not carry one across a sort
 * change — the server rejects a cursor issued under a different ordering with 400
 * `cursor_sort_mismatch`, because honouring it would silently drop and repeat products (FR-016b). */
export interface ProductSearchResultDTO {
  items: StorefrontProductCardDTO[];
  nextCursor: string | null;
  /** Total products matching the refinements, ignoring pagination (025 FR-016a). */
  total: number;
  /** The ordering ACTUALLY applied — may differ from the request. Render the sort control from this,
   * not from what was asked for, or the control will misdescribe the list beneath it. */
  sort: ProductSort;
}

/** Whether Effy delivers to a location, answered BEFORE a cart exists (025 FR-014).
 *
 * ⚠ Deliberately just the answer. No delivery fee or window (FR-014a — both depend on cart contents,
 * so anything shown here is an estimate checkout would revise), and no zone id or name (FR-006 — zone
 * names are geographic and would disclose where Effy fulfils from). */
export interface ServiceabilityDTO {
  /** The normalised postcode the answer applies to. */
  postcode: string;
  serviced: boolean;
}
