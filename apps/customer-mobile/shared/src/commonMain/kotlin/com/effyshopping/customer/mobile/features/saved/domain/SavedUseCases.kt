package com.effyshopping.customer.mobile.features.saved.domain

import com.effyshopping.customer.mobile.core.error.AppException

/**
 * Saved-items use cases (033).
 *
 * ⚠ THE ONE SHAPE EVERY MUTATION HAS, inherited from 027's cart:
 *
 *   1. apply to the mirror (synchronously, so the control responds instantly)
 *   2. send to the platform
 *
 * In that order, always. A control that waits for the network before moving feels broken on a slow
 * connection, and a control that moves and never reverts lies about what was recorded.
 */

/**
 * Toggle a product's saved state, optimistically.
 *
 * ⚠ Takes the DESIRED end state rather than "flip whatever is there". Under rapid tapping a flip
 * resolves against whatever the mirror happened to hold when the coroutine ran, so two fast taps can
 * settle on the wrong value; an absolute intent cannot (FR-014 — last intent wins, independent of the
 * order responses arrive in).
 *
 * ⚠ Idempotent at both ends: the platform's PUT/DELETE are no-ops when already in the target state,
 * so a retry is always safe.
 */
class ToggleSaved(
    private val repo: SavedRepository,
    private val store: SavedStore,
    private val isSignedIn: () -> Boolean,
    private val now: () -> String,
) {
    /**
     * Returns false when a GUEST is refused by the device cap, so the caller can say why.
     *
     * [priceAmount]/[currency] are what the tapped surface knew, and may be null — the merge then
     * falls back to the product's real current price rather than inventing a baseline.
     */
    suspend operator fun invoke(
        productId: String,
        saved: Boolean,
        priceAmount: String? = null,
        currency: String? = null,
    ): Boolean {
        val previous = store.isSaved(productId)
        if (previous == saved) return true // nothing to do — and nothing to revert if it fails

        // ⚠ A GUEST NEVER SEES A SIGN-IN WALL (FR-024). Their taps are kept on the device and joined
        // to an account later. The sign-in wall is the single biggest documented reason saved-item
        // features go unused, and the predecessor put one on the very first tap.
        if (!isSignedIn()) {
            if (saved && store.guestCount() >= GUEST_CAP) return false
            store.applyGuest(productId, saved, priceAmount, currency, now())
            return true
        }

        store.apply(productId, saved)
        try {
            if (saved) repo.save(productId) else repo.remove(productId)
        } catch (e: AppException) {
            store.revert(productId, previous)
            throw e
        }
        return true
    }
}

/**
 * How many a device-held guest list may hold (FR-046).
 *
 * ⚠ Smaller than the account cap because a device-held list has no account behind it. Reaching it
 * REFUSES the save; nothing already saved is ever evicted to make room (FR-047). Mirrors
 * `saveditems.GuestCap` on the hot path.
 */
const val GUEST_CAP = 50

/**
 * Load the shopper's membership into the mirror.
 *
 * ⚠ On failure the mirror is LEFT ALONE rather than emptied. Emptying it would render every heart
 * unsaved, which invites exactly the destructive second tap this feature exists to remove — so a
 * failed refresh degrades to stale-but-plausible instead of confidently wrong.
 */
class LoadSavedMembership(
    private val repo: SavedRepository,
    private val store: SavedStore,
) {
    suspend operator fun invoke() {
        store.adopt(repo.membership())
    }
}

/** The saved list, with a verdict per item for the shopper's current location. */
class ListSaved(private val repo: SavedRepository) {
    suspend operator fun invoke(postcode: String?): List<SavedItem> = repo.list(postcode)
}

/**
 * Remove an item from the list, keeping what undo needs to put it back.
 *
 * Returns the removed item's `savedAt` so the caller can restore the position it held (FR-018). A
 * deliberate re-save later is a different act and correctly goes to the top.
 */
class RemoveSaved(
    private val repo: SavedRepository,
    private val store: SavedStore,
) {
    suspend operator fun invoke(item: SavedItem): String {
        store.apply(item.productId, false)
        try {
            repo.remove(item.productId)
        } catch (e: AppException) {
            store.revert(item.productId, true)
            throw e
        }
        return item.savedAt
    }
}

/** Undo a removal, restoring the item to the position it previously held (FR-018). */
class UndoRemoveSaved(
    private val repo: SavedRepository,
    private val store: SavedStore,
) {
    suspend operator fun invoke(productId: String, savedAt: String) {
        store.apply(productId, true)
        try {
            repo.save(productId, restoreSavedAt = savedAt)
        } catch (e: AppException) {
            store.revert(productId, false)
            throw e
        }
    }
}

/**
 * Fold the device-held guest list into the account on sign-in (FR-028).
 *
 * ⚠ THE DEVICE LIST IS CLEARED ONLY AFTER THE PLATFORM ACKNOWLEDGES. `cart-actions.ts` records why:
 * "clearing first and merging second is how 019's Option B lost carts." Here `adopt()` does the
 * clearing, and it only runs on a successful response.
 *
 * ⚠ Idempotent, so it is safe on EVERY sign-in — including the second one on a device that already
 * merged (FR-029).
 */
class MergeSavedOnSignIn(
    private val merge: SavedMergeRepository,
    private val store: SavedStore,
) {
    /** Returns how many items joined, so the surface can DISCLOSE it (FR-032). */
    suspend operator fun invoke(): Int {
        val entries = store.guestEntries()
        val outcome = merge.merge(entries)
        store.adopt(SavedMembership(outcome.productIds))
        return outcome.added
    }
}


/**
 * Add every purchasable saved item to the cart (FR-051).
 *
 * ⚠ The SERVER decides what is purchasable. A client filtering by its own copy of the verdict would
 * be re-implementing the four-term delivery predicate, and the two would drift — which is the exact
 * class of defect this feature exists to remove.
 */
class AddAllSavedToCart(private val repo: SavedCartRepository) {
    suspend operator fun invoke(postcode: String?, changeId: String): SavedAddToCartOutcome =
        repo.addAllToCart(postcode, changeId)
}
