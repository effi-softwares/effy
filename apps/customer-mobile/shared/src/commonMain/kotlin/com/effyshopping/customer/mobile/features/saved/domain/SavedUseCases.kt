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

/** What a tap on the heart came to. */
enum class ToggleOutcome {
    /** The shopper's intent was applied (or was already true). */
    DONE,

    /** A guest at the device cap. Nothing was saved, and nothing was evicted to make room. */
    GUEST_CAP,

    /**
     * ⚠ 068 FR-020: the product is in a list the shopper named, so the tap removed NOTHING and the
     * caller must open the list chooser. One tap on a heart never takes a product out of a list.
     */
    OPEN_CHOOSER,
}

/**
 * The heart. Optimistic: the mirror moves first and the platform is told second; a refusal puts it
 * back (FR-012).
 *
 * Takes the DESIRED end state rather than "flip whatever is there", so two fast taps cannot settle on
 * the wrong value (FR-014).
 */
class ToggleSaved(
    private val repo: SavedRepository,
    private val store: SavedStore,
    private val isSignedIn: () -> Boolean,
    private val now: () -> String,
) {
    suspend operator fun invoke(
        productId: String,
        saved: Boolean,
        priceAmount: String? = null,
        currency: String? = null,
    ): ToggleOutcome {
        val previous = store.isSaved(productId)
        if (previous == saved) return ToggleOutcome.DONE // nothing to do — and nothing to revert if it fails

        if (!isSignedIn()) {
            // ⚠ A guest has no named lists, so a guest's filled heart always un-saves.
            if (saved && store.guestCount() >= GUEST_CAP) return ToggleOutcome.GUEST_CAP
            store.applyGuest(productId, saved, priceAmount, currency, now())
            return ToggleOutcome.DONE
        }

        // Known in advance: nothing is sent and the heart never flickers.
        if (!saved && store.isInNamedList(productId)) return ToggleOutcome.OPEN_CHOOSER

        store.apply(productId, saved)
        try {
            if (saved) repo.save(productId) else repo.remove(productId)
        } catch (e: ListRefusedException) {
            store.revert(productId, previous)
            // The mirror did not know (another device made the list). The platform refused; nothing
            // was removed. Any other refusal of a save is the cap.
            if (e.refusal == ListRefusal.IN_NAMED_LISTS) return ToggleOutcome.OPEN_CHOOSER
            throw e
        } catch (e: AppException) {
            store.revert(productId, previous)
            throw e
        }
        return ToggleOutcome.DONE
    }
}


/**
 * How many a device-held guest list may hold (FR-046).
 *
 * ⚠ Smaller than the account cap because a device-held list has no account behind it. Reaching it
 * REFUSES the save; nothing already saved is ever evicted to make room (FR-047). Mirrors
 * the saved-items guest cap on the server.
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
    suspend operator fun invoke(listId: String = DEFAULT_LIST_ID): List<SavedItem> = repo.list(listId)
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
        // ⚠ 068: the merge answer does not say which products are in NAMED lists, so the named set
        // the store already holds is carried over rather than wiped. The next membership read
        // (every screen with hearts does one) brings the platform's own answer.
        store.adopt(SavedMembership(outcome.productIds, store.named.value intersect outcome.productIds))
        return outcome.added
    }
}


/** Adds every purchasable product in ONE list to the cart — the weekly-shop action (068 FR-028). */
class AddAllSavedToCart(private val repo: SavedCartRepository) {
    suspend operator fun invoke(listId: String, changeId: String): SavedAddToCartOutcome =
        repo.addAllToCart(listId, changeId)
}

/* ── 068: lists ──────────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠ EVERY CHANGE BELOW RE-READS THE MEMBERSHIP rather than patching the mirror. Whether a product is
 * still saved, and whether it is still in a named list, depends on every list it is in — a rule the
 * platform owns. A failed re-read is swallowed: the change itself succeeded, and the next screen
 * with hearts reads again.
 */
class LoadLists(private val repo: ListRepository) {
    suspend operator fun invoke(productId: String? = null): List<SavedList> = repo.lists(productId)
}

class CreateList(private val repo: ListRepository, private val reload: LoadSavedMembership) {
    suspend operator fun invoke(name: String, productId: String? = null): SavedList {
        val list = repo.create(name, productId)
        if (productId != null) runCatching { reload() }
        return list
    }
}

class RenameList(private val repo: ListRepository) {
    suspend operator fun invoke(listId: String, name: String): SavedList = repo.rename(listId, name)
}

class DeleteList(private val repo: ListRepository, private val reload: LoadSavedMembership) {
    suspend operator fun invoke(listId: String) {
        repo.delete(listId)
        runCatching { reload() }
    }
}

class AddToList(private val repo: ListRepository, private val reload: LoadSavedMembership) {
    suspend operator fun invoke(listId: String, productId: String, restoreAddedAt: String? = null) {
        repo.addEntry(listId, productId, restoreAddedAt)
        runCatching { reload() }
    }
}

class RemoveFromList(private val repo: ListRepository, private val reload: LoadSavedMembership) {
    suspend operator fun invoke(listId: String, productId: String) {
        repo.removeEntry(listId, productId)
        runCatching { reload() }
    }
}
