/**
 * Customer saved items — the price-and-availability WATCHLIST (033).
 *
 * Replaces the retired `favorite.ts` / `FavoriteDTO` entirely. Two things the predecessor got wrong
 * are fixed at the contract, not in the clients:
 *
 *   1. Nothing could answer "is this product already saved?", so every surface assumed NOT SAVED on
 *      every render — and a shopper's second tap silently un-saved what they were trying to save.
 *      `SavedMembershipDTO` is that answer, delivered ONCE per screen rather than once per product.
 *   2. The list called a product available whenever the catalogue said `status = 'active'`, which is
 *      not the same question as "can this shopper buy it". `SavedVerdict` replaces that boolean with
 *      five distinguishable outcomes.
 *
 * ⚠ NOT to be confused with the cart's set-aside (`cart.ts`, 027) — a bookmark, not a heart, a
 * different table, and a different capability.
 */
import type { WireInt } from "./cart";
import type { ProductBadge } from "./storefront";

/**
 * Whether the shopper can buy a saved item right now, at the delivery location they are shopping for.
 *
 * ⚠ FIVE VALUES, NOT A BOOLEAN, and the distinctions are the point: each one implies a different next
 * action, and collapsing any two of them tells the shopper nothing they can act on.
 *
 *   purchasable                 → buy now
 *   temporarily_unavailable     → sold and delivered here, just not in stock — wait
 *   not_delivered_to_your_area  → sold and in stock, but nothing reaches this address — change address
 *   no_longer_sold              → withdrawn from sale entirely — give up
 *   not_yet_determined          → the shopper has not said where they live — tell us
 *
 * ⚠ "Unavailable" and "we don't deliver that to you" are DIFFERENT STATEMENTS and only one of them is
 * true in any given case. Merging them is the 031 REGIONAL defect in miniature: a shopper invited to a
 * checkout that refuses them, with no way to tell whether waiting would help.
 */
export type SavedVerdict =
  | "purchasable"
  | "temporarily_unavailable"
  | "not_delivered_to_your_area"
  | "no_longer_sold"
  | "not_yet_determined";

/**
 * One entry in the saved list.
 *
 * Name, image and CURRENT price are read live (FR-045) — a renamed or re-imaged product shows its
 * true present identity. Only `savedPriceAmount` is remembered, and only so a drop is detectable.
 *
 * ⚠ THIS DELIBERATELY DOES NOT EXTEND `StorefrontProductCardDTO`, and the reason is the whole point
 * of the feature. That interface carries `available: boolean` — a flag derived from catalogue status
 * alone, which is precisely the field that lied: a product can be `available: true` and still not
 * purchasable at the shopper's address, which is how the predecessor invited people into a checkout
 * that refused them. `verdict` REPLACES it. Extending the card would carry the lying boolean back in
 * beside the five-way answer that supersedes it, and a client would then have two fields
 * disagreeing about the same question — which is how they end up rendering the wrong one.
 *
 * The shared card fields are therefore repeated here on purpose. That is duplication with a reason,
 * not drift.
 */
export interface SavedItemDTO {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  priceAmount: string;
  currency: string;
  compareAtAmount: string | null;
  badges: ProductBadge[];
  /** When it was saved. Drives list order (newest first) and undo's restore position. */
  savedAt: string;
  /** The price at the moment of saving — the baseline `priceDropped` is measured against. */
  savedPriceAmount: string;
  /**
   * Present and `true` only when the current price is BELOW the save-time price.
   *
   * ⚠ There is deliberately no `priceRose`. The current price is always shown, so nothing is
   * concealed — but a rise is not something a shopper can act on, and badging it would add noise to
   * the one signal this list exists to carry.
   */
  priceDropped?: boolean;
  verdict: SavedVerdict;
  /** For client-side grouping by aisle (FR-056). Absent when the product has no primary category. */
  categoryKey?: string;
}

/**
 * The shopper's whole set of saved product ids.
 *
 * ⚠ THIS IS WHAT MAKES THE HEART TELL THE TRUTH. It is fetched ONCE per screen and answers for every
 * product on it. The two alternatives were both rejected: an `isSaved` field on catalogue reads would
 * make every product response shopper-specific and destroy the storefront's static shell, and a
 * per-product lookup would be one request per tile (FR-020).
 *
 * Bounded by the 200-item cap, which is what keeps a whole-set read cheap enough to do this way.
 */
export interface SavedMembershipDTO {
  productIds: string[];
  /** ⚠ WireInt, not number — see the note on the import. */
  count: WireInt;
}

/** One device-held saved item being offered to an account (FR-028). */
export interface SavedMergeItem {
  productId: string;
  /**
   * ⚠ The GUEST's save-time price travels with it. Taking the price at merge time instead would
   * silently erase the movement the watchlist exists to report, for exactly the shopper who saved
   * earliest and has waited longest.
   *
   * ⚠ NULLABLE, and absent is meaningful: it means the device never observed a price, because the
   * surface the shopper tapped on carried only a product id. The platform then uses the product's
   * CURRENT price as the baseline — which is what an ordinary save records. Sending `"0"` instead
   * would report the item as having fallen from nothing: a fabricated fact, worse than an absent one.
   */
  savedPriceAmount: string | null;
  savedCurrency: string | null;
  savedAt: string;
}

export interface SavedMergeRequest {
  items: SavedMergeItem[];
}

/** Why one product could not be taken (a merge or a bulk add). */
export interface SavedSkip {
  productId: string;
  /** `cap_reached` | `not_found` | a `SavedVerdict` | a cart refusal reason. */
  reason: string;
}

/**
 * The result of joining a device-held list into an account.
 *
 * Returns the resulting set so the client seeds its store from this response rather than issuing a
 * second read, and `added` so the surface can DISCLOSE the join by count (FR-032) instead of silently
 * absorbing someone else's saves on a shared device.
 */
export interface SavedMergeResultDTO {
  /** ⚠ WireInt, not number. */
  added: WireInt;
  skipped: SavedSkip[];
  productIds: string[];
}

export interface SavedAddToCartRequest {
  /** Absent means no delivery location is known — nothing is purchasable, so nothing is added. */
  postcode?: string;
}

/**
 * The result of adding every purchasable saved item to the cart.
 *
 * ⚠ `skipped` is the whole point of this shape. FR-052 forbids silent omission: a bulk add that
 * quietly drops what it could not take leaves the shopper believing they bought something they did
 * not. Every omission carries a reason.
 */
export interface SavedAddToCartResultDTO {
  added: string[];
  skipped: SavedSkip[];
}
