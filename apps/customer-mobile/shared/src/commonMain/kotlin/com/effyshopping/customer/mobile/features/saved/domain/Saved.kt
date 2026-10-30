package com.effyshopping.customer.mobile.features.saved.domain

import com.effyshopping.customer.mobile.features.catalog.domain.UnitPrice

/**
 * The saved-items domain - a price-and-availability watchlist, not a wishlist.
 *
 * Clean-Architecture domain models: the app's own types, mapped from the generated wire DTOs in the
 * data layer (Principle VI - wire shapes never leak past `data`).
 *
 * Not the cart's set-aside, which is a bookmark and a different capability.
 */

/**
 * Whether the shopper can buy a saved item right now, at the location they are shopping for.
 *
 * Five values, not a boolean, and that is the whole point of the slice. The capability this
 * replaces reported `available = true` whenever the catalogue said `status = 'active'` - but with
 * hidden fulfilment and zone-scoped delivery a product can be perfectly active and still unreachable
 * at the shopper's address, so the list invited people into a checkout that refused them.
 *
 * Each value implies a different next action, which is why collapsing any two is a regression:
 *
 *  purchasable → buy now
 *  TEMPORARILY_UNAVAILABLE → sold and delivered here, just not in stock - wait
 *  NO_LONGER_SOLD → withdrawn entirely - give up
 */
enum class SavedVerdict {
    PURCHASABLE,
    TEMPORARILY_UNAVAILABLE,
    NO_LONGER_SOLD,
    ;

    /** Only a purchasable item can be added to a cart. Everything else needs the shopper to act first. */
    val isPurchasable: Boolean get() = this == PURCHASABLE
}

/** One entry in the saved list, with `brand`, `compareAtAmount` and `badges` (so a sale on a saved item shows). */
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
    /** The price when it was saved - the baseline [priceDropped] is measured against. */
    val savedPriceAmount: String,
    /**
     * True only when the current price is below the save-time price.
     *
     * There is deliberately no `priceRose`. The current price is always shown, so nothing is
     * concealed, but a rise is not something a shopper can act on.
     */
    val priceDropped: Boolean,
    val verdict: SavedVerdict,
    /** For grouping the list by aisle. */
    val categoryKey: String?,
    /**
     * The size "Add to cart" adds: the one remembered when it was saved, else the product's only
     * one. Null when it is sold in several sizes and none is remembered: the shopper chooses on its page.
     */
    val variantId: String? = null,
    /** The remembered size's words ("1 kg"). */
    val variantLabel: String? = null,
    val variantCount: Int = 1,
    val unitPrice: UnitPrice? = null,
)

/**
 * The shopper's whole set of saved product ids, across every list - the read that makes the heart
 * tell the truth.
 *
 * [namedProductIds] is the subset held in a list the shopper named. A tap on a filled heart
 * un-saves a product that is only in "Saved"; for one of these it opens the list chooser instead,
 * because one tap must never take a product out of a list the shopper built.
 */
data class SavedMembership(
    val productIds: Set<String>,
    val namedProductIds: Set<String> = emptySet(),
)

/**
 * The saved-items platform contract.
 *
 * [save] and [remove] are idempotent in both directions. A retry, a double-tap, or
 * a request whose response never arrived can never leave the state inverted.
 */
interface SavedRepository {
    /** One request per screen, regardless of how many products it shows. */
    suspend fun membership(): SavedMembership

    /**
     * The list with a verdict per item.
     *
     * No location. Delivery zones were withdrawn from the platform, so purchasability is decided by
     * catalogue status alone and every address is implicitly deliverable.
     */
    suspend fun list(listId: String = DEFAULT_LIST_ID): List<SavedItem>

    /**
     * [restoreSavedAt] is set only by undo, returning the item to the position it previously held.
     * An ordinary save leaves it null and the item lands at the top - a deliberate re-save after a
     * completed removal is a new save, and the list must be able to say so.
     */
    suspend fun save(productId: String, restoreSavedAt: String? = null, variantId: String? = null)

    /**
     * The heart's un-save. Throws [ListRefusedException] with [ListRefusal.IN_NAMED_LISTS] when the product is
     * in a list the shopper named: nothing was removed; the caller opens the list chooser.
     */
    suspend fun remove(productId: String)
}

/**
 * One entry in a guest's device-held list. It carries the save-time price when known and omits it
 * otherwise (the platform then uses the current price as the baseline); never `0`, which would read as a
 * price drop from nothing.
 */
@kotlinx.serialization.Serializable
data class SavedGuestEntry(
    val productId: String,
    val savedPriceAmount: String? = null,
    val savedCurrency: String? = null,
    val savedAt: String,
)

/** Folds a device-held guest list into the account on sign-in. */
interface SavedMergeRepository {
    suspend fun merge(items: List<SavedGuestEntry>): SavedMergeOutcome
}

/** [added] exists so the surface can disclose the join by count, never absorb it silently. */
data class SavedMergeOutcome(
    val added: Int,
    val productIds: Set<String>,
    val skipped: List<SavedMergeSkip>,
)

data class SavedMergeSkip(val productId: String, val reason: String)

/** Adds every purchasable product in one list to the cart. */
interface SavedCartRepository {
    suspend fun addAllToCart(listId: String, changeId: String): SavedAddToCartOutcome
}

/**
 * [skipped] is the whole point of this shape. FR-052 forbids silent omission: a bulk add that
 * quietly drops what it could not take leaves the shopper believing they bought something they did
 * not, and they find out at the till.
 */
data class SavedAddToCartOutcome(
    val added: List<String>,
    val skipped: List<SavedMergeSkip>,
)

/* Lists the shopper names for themselves */

/** The default list's id on the wire. No screen ever needs its real id. */
const val DEFAULT_LIST_ID = "default"

/** What the default list is called. Its name is not stored: the platform sends null. */
const val DEFAULT_LIST_NAME = "Saved"

/**
 * The longest list name, in code points. Mirrors `LIST_NAME_MAX` in `@effy/shared-types`.
 *
 * Advisory. It drives the remaining-characters count; the platform decides, and a name it refuses
 * comes back as [ListRefusal.INVALID_NAME] whatever this says.
 */
const val LIST_NAME_MAX = 40

/** One of the shopper's lists. [name] is null for the default list. */
data class SavedList(
    val id: String,
    val isDefault: Boolean,
    val name: String?,
    val count: Int,
    /** How many of its products are in NO other list: what deleting it would un-save. */
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
 * Not an [com.effyshopping.customer.mobile.core.error.AppException]. Those are mapped from the
 * status code alone, and two different list refusals share a status; this carries the reason.
 */
class ListRefusedException(val refusal: ListRefusal) : Exception()

/** The shopper's own lists, and which products are in them. */
interface ListRepository {
    /** Every list, the default first. With [productId], each says whether it holds that product. */
    suspend fun lists(productId: String? = null): List<SavedList>

    /** [productId] is placed in the new list in the same action; a refusal creates nothing. */
    suspend fun create(name: String, productId: String? = null, variantId: String? = null): SavedList

    suspend fun rename(listId: String, name: String): SavedList

    /** Products that were only in this list stop being saved. Products in another list stay there. */
    suspend fun delete(listId: String)

    /** [restoreAddedAt] is set only by undo: the product returns to the position it held. */
    /** [variantId] is the size on screen, remembered with the product (a list holds products). */
    suspend fun addEntry(listId: String, productId: String, restoreAddedAt: String? = null, variantId: String? = null)

    /** Takes the product out of this list only. Never refused. */
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
