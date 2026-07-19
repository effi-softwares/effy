/**
 * Favorites contracts — 019-customer-commerce-flow.
 *
 * A saved (customer, product) pair, listed as product cards most-recent-first. Save/un-save are
 * idempotent (PUT/DELETE /v1/favorites/{productId}). Amounts are decimal strings + currency (R9).
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §2.9/§3.
 */
import type { StorefrontProductCardDTO } from "./storefront";

/** A saved product (product card fields + when it was saved). */
export interface FavoriteDTO extends StorefrontProductCardDTO {
  savedAt: string;
}
