package com.effyshopping.customer.mobile.features.saved.domain

/**
 * The saved-items domain (033) — a price-and-availability WATCHLIST, not a wishlist.
 *
 * Clean-Architecture domain models: the app's OWN types, mapped from the generated wire DTOs in the
 * data layer (Principle VI — wire shapes never leak past `data`).
 *
 * ⚠ NOT the cart's set-aside (027), which is a bookmark and a different capability.
 */

/**
 * Whether the shopper can buy a saved item right now, at the location they are shopping for.
 *
 * ⚠ FIVE VALUES, NOT A BOOLEAN, and that is the whole point of the slice. The capability this
 * replaces reported `available = true` whenever the catalogue said `status = 'active'` — but with
 * hidden fulfilment and zone-scoped delivery a product can be perfectly active and still unreachable
 * at the shopper's address, so the list invited people into a checkout that refused them.
 *
 * Each value implies a DIFFERENT next action, which is why collapsing any two is a regression:
 *
 *   PURCHASABLE                → buy now
 *   TEMPORARILY_UNAVAILABLE    → sold and delivered here, just not in stock — wait
 *   NOT_DELIVERED_TO_YOUR_AREA → sold and in stock, nothing reaches this address — change address
 *   NO_LONGER_SOLD             → withdrawn entirely — give up
 *   NOT_YET_DETERMINED         → we have no delivery location — tell us where you live
 */
enum class SavedVerdict {
    PURCHASABLE,
    TEMPORARILY_UNAVAILABLE,
    NOT_DELIVERED_TO_YOUR_AREA,
    NO_LONGER_SOLD,
    NOT_YET_DETERMINED,
    ;

    /** Only a purchasable item can be added to a cart. Everything else needs the shopper to act first. */
    val isPurchasable: Boolean get() = this == PURCHASABLE
}

/**
 * One entry in the saved list.
 *
 * ⚠ Carries `brand`, `compareAtAmount` and `badges`. The predecessor's domain model DROPPED all
 * three — and then a comment on the screen blamed "the favourites projection" for carrying fewer
 * fields. It did not; the backend computed them and the mapper threw them away, so a sale on a saved
 * item was invisible on this surface while visible everywhere else.
 */
data class SavedItem(
    val productId: String,
    val name: String,
    val brand: String?,
    val imageUrl: String?,
    val priceAmount: String,
    val currency: String,
    val compareAtAmount: String?,
    val badges: List<String>,
    val savedAt: String,
    /** The price when it was saved — the baseline [priceDropped] is measured against. */
    val savedPriceAmount: String,
    /**
     * True only when the current price is BELOW the save-time price.
     *
     * ⚠ There is deliberately no `priceRose`. The current price is always shown, so nothing is
     * concealed, but a rise is not something a shopper can act on (FR-044).
     */
    val priceDropped: Boolean,
    val verdict: SavedVerdict,
    /** For grouping the list by aisle (FR-056). */
    val categoryKey: String?,
)

/** The shopper's whole set of saved product ids — the read that makes the heart tell the truth. */
data class SavedMembership(
    val productIds: Set<String>,
)

/**
 * The saved-items platform contract.
 *
 * ⚠ [save] and [remove] are IDEMPOTENT in both directions (FR-009/FR-010). A retry, a double-tap, or
 * a request whose response never arrived can never leave the state inverted.
 */
interface SavedRepository {
    /** One request per screen, regardless of how many products it shows (FR-020). */
    suspend fun membership(): SavedMembership

    /**
     * The list with a verdict per item.
     *
     * [postcode] is null when the shopper has no delivery location — a first-class case, not an
     * error. Every item then reports [SavedVerdict.NOT_YET_DETERMINED] (FR-038).
     */
    suspend fun list(postcode: String?): List<SavedItem>

    /**
     * [restoreSavedAt] is set ONLY by undo, returning the item to the position it previously held.
     * An ordinary save leaves it null and the item lands at the top — a deliberate re-save after a
     * completed removal is a NEW save, and the list must be able to say so (FR-018).
     */
    suspend fun save(productId: String, restoreSavedAt: String? = null)

    suspend fun remove(productId: String)
}

/**
 * One entry in a GUEST's device-held saved list.
 *
 * ⚠ It carries the save-time price when the surface knew one — and omits it when it did not, rather
 * than storing a placeholder. On merge, an absent price means the platform uses the product's current
 * price as the baseline, which is what an ordinary save records. Storing `0` instead would report the
 * item as having fallen from nothing: a fabricated fact, worse than an absent one.
 */
@kotlinx.serialization.Serializable
data class SavedGuestEntry(
    val productId: String,
    val savedPriceAmount: String? = null,
    val savedCurrency: String? = null,
    val savedAt: String,
)

/** Folds a device-held guest list into the account on sign-in (FR-028). */
interface SavedMergeRepository {
    suspend fun merge(items: List<SavedGuestEntry>): SavedMergeOutcome
}

/** ⚠ [added] exists so the surface can DISCLOSE the join by count (FR-032), never absorb it silently. */
data class SavedMergeOutcome(
    val added: Int,
    val productIds: Set<String>,
    val skipped: List<SavedMergeSkip>,
)

data class SavedMergeSkip(val productId: String, val reason: String)


/** Adds every purchasable saved item to the cart (FR-051). */
interface SavedCartRepository {
    suspend fun addAllToCart(postcode: String?, changeId: String): SavedAddToCartOutcome
}

/**
 * ⚠ [skipped] is the whole point of this shape. FR-052 forbids silent omission: a bulk add that
 * quietly drops what it could not take leaves the shopper believing they bought something they did
 * not, and they find out at the till.
 */
data class SavedAddToCartOutcome(
    val added: List<String>,
    val skipped: List<SavedMergeSkip>,
)
