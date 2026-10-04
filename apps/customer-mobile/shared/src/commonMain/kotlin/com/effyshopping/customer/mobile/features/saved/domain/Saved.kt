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
 *   NO_LONGER_SOLD             → withdrawn entirely — give up
 */
enum class SavedVerdict {
    PURCHASABLE,
    TEMPORARILY_UNAVAILABLE,
    NO_LONGER_SOLD,
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

/**
 * The shopper's whole set of saved product ids, across EVERY list — the read that makes the heart
 * tell the truth.
 *
 * [namedProductIds] (068) is the subset held in a list the shopper named. A tap on a filled heart
 * un-saves a product that is only in "Saved"; for one of these it opens the list chooser instead,
 * because one tap must never take a product out of a list the shopper built (FR-020).
 */
data class SavedMembership(
    val productIds: Set<String>,
    val namedProductIds: Set<String> = emptySet(),
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
     * ⚠ No location. Delivery zones were withdrawn from the platform, so purchasability is decided by
     * catalogue status alone and every address is implicitly deliverable.
     */
    suspend fun list(listId: String = DEFAULT_LIST_ID): List<SavedItem>

    /**
     * [restoreSavedAt] is set ONLY by undo, returning the item to the position it previously held.
     * An ordinary save leaves it null and the item lands at the top — a deliberate re-save after a
     * completed removal is a NEW save, and the list must be able to say so (FR-018).
     */
    suspend fun save(productId: String, restoreSavedAt: String? = null)

    /**
     * The HEART's un-save.
     *
     * ⚠ Throws [ListRefusedException] with [ListRefusal.IN_NAMED_LISTS] when the product is in a list
     * the shopper named. Nothing was removed; the caller opens the list chooser.
     */
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


/** Adds every purchasable product in ONE list to the cart (FR-051, 068 FR-028). */
interface SavedCartRepository {
    suspend fun addAllToCart(listId: String, changeId: String): SavedAddToCartOutcome
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


/* ── 068: lists the shopper names for themselves ─────────────────────────────────────────────── */

/** The default list's id on the wire. No screen ever needs its real id. */
const val DEFAULT_LIST_ID = "default"

/** What the default list is called. Its name is not stored: the platform sends null. */
const val DEFAULT_LIST_NAME = "Saved"

/**
 * The longest list name, in code points. Mirrors `LIST_NAME_MAX` in `@effy/shared-types`.
 *
 * ⚠ ADVISORY. It drives the remaining-characters count; the platform decides, and a name it refuses
 * comes back as [ListRefusal.INVALID_NAME] whatever this says.
 */
const val LIST_NAME_MAX = 40

/** One of the shopper's lists. [name] is null for the default list. */
data class SavedList(
    val id: String,
    val isDefault: Boolean,
    val name: String?,
    val count: Int,
    /** How many of its products are in NO other list: what deleting it would un-save (FR-006). */
    val onlyHereCount: Int,
    /** Set only when the read named a product. */
    val containsProduct: Boolean? = null,
) {
    val label: String get() = name ?: DEFAULT_LIST_NAME
}

/** Why the platform refused a list request. A closed set; screens map each to their own words. */
enum class ListRefusal {
    NAME_TAKEN,
    INVALID_NAME,
    LIST_LIMIT,
    DEFAULT_LIST,
    LIST_NOT_FOUND,
    IN_NAMED_LISTS,
    CAP_REACHED,
}

/**
 * A list request the platform understood and refused.
 *
 * ⚠ NOT an [com.effyshopping.customer.mobile.core.error.AppException]. Those are mapped from the
 * status code alone, and two different list refusals share a status; this carries the reason.
 */
class ListRefusedException(val refusal: ListRefusal) : Exception()

/** The shopper's own lists, and which products are in them. */
interface ListRepository {
    /** Every list, the default first. With [productId], each says whether it holds that product. */
    suspend fun lists(productId: String? = null): List<SavedList>

    /** [productId] is placed in the new list in the same action; a refusal creates nothing. */
    suspend fun create(name: String, productId: String? = null): SavedList

    suspend fun rename(listId: String, name: String): SavedList

    /** Products that were only in this list stop being saved. Products in another list stay there. */
    suspend fun delete(listId: String)

    /** [restoreAddedAt] is set ONLY by undo: the product returns to the position it held. */
    suspend fun addEntry(listId: String, productId: String, restoreAddedAt: String? = null)

    /** Takes the product out of THIS list only. Never refused. */
    suspend fun removeEntry(listId: String, productId: String)
}

/** How many characters of a list name remain, counted as the platform counts them: code points. */
fun listNameRemaining(name: String): Int {
    val normalised = name.trim().replace(Regex("\\s+"), " ")
    return LIST_NAME_MAX - normalised.codePointCount()
}

private fun String.codePointCount(): Int {
    var n = 0
    var i = 0
    while (i < length) {
        if (this[i].isHighSurrogate() && i + 1 < length && this[i + 1].isLowSurrogate()) i++
        i++
        n++
    }
    return n
}
