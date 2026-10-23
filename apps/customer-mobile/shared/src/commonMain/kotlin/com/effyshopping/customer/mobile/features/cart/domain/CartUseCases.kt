package com.effyshopping.customer.mobile.features.cart.domain

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.util.newUuid

/**
 * The cart's use cases — the domain layer the UI calls, between the ViewModel/View and the
 * repository (Principle VI: presentation never reaches data directly).
 *
 * The one shape every mutation has
 *
 *  1. apply to the mirror — synchronous, so the tap lands immediately
 *  2. submit to the coordinator — which sends it, or drops it for a guest
 *
 * In that order, always. Reversing them would mean the UI waits on a network call before it moves, which
 * is the whole thing this design exists to avoid.
 *
 * Each mutation mints one `changeId` per shopper action, here. Not per attempt — a retry reuses it, so a
 * request that arrived without its response reaching us cannot apply twice. Minting inside the
 * retry loop would turn "add 1 milk" into "add 1 milk twice" precisely when the network is worst.
 */

/** Add or increment a line. */
class AddToCart(
    private val store: CartStore,
    private val sync: CartSyncCoordinator,
) {
    operator fun invoke(line: GuestCartLine) {
        store.add(line)
        sync.submit(
            PendingChange(
                changeId = newUuid(),
                kind = PendingChangeKind.Add,
                variantId = line.variantId,
                quantity = line.quantity,
            ),
        )
    }
}

/**
 * Set a line's quantity; 0 removes it.
 *
 * The quantity sent is absolute, which is what will let US4 debounce ten taps into one request and drop
 * the values in between without corrupting anything.
 */
class SetCartQuantity(
    private val store: CartStore,
    private val sync: CartSyncCoordinator,
) {
    operator fun invoke(variantId: String, quantity: Int) {
        store.setQuantity(variantId, quantity)
        // Debounced, unlike add: a stepper is tapped repeatedly and only the value the shopper settles on
        // matters. Safe only because the payload is absolute.
        sync.submitDebounced(
            PendingChange(
                changeId = newUuid(),
                kind = if (quantity <= 0) PendingChangeKind.Remove else PendingChangeKind.SetQuantity,
                variantId = variantId,
                quantity = quantity,
            ),
        )
    }
}

/** Remove a line. */
class RemoveFromCart(
    private val store: CartStore,
    private val sync: CartSyncCoordinator,
) {
    operator fun invoke(variantId: String) {
        store.remove(variantId)
        sync.submit(
            PendingChange(changeId = newUuid(), kind = PendingChangeKind.Remove, variantId = variantId),
        )
    }
}

/** Empty the payable cart. Set-aside items survive. */
class ClearCart(
    private val store: CartStore,
    private val sync: CartSyncCoordinator,
) {
    operator fun invoke() {
        store.clear()
        sync.submit(PendingChange(changeId = newUuid(), kind = PendingChangeKind.Clear))
    }
}

/**
 * Move a line out of the payable cart, keeping it.
 *
 * Set-aside is the one cart operation with no local shortcut. The mirror cannot move a line between the
 * two lists on its own without inventing what the saved list looks like — quantities, prices and
 * availability all come from the platform — so this waits for the answer and adopts it. A guest has no
 * server cart and therefore no saved list at all, which is why it is a no-op for them rather than a
 * half-working local imitation.
 */
class SetAside(
    private val store: CartStore,
    private val repo: CartRepository,
    private val isSignedIn: () -> Boolean,
) {
    suspend operator fun invoke(variantId: String): Boolean {
        if (!isSignedIn()) return false
        return runCatching { store.adopt(repo.setAside(variantId, newUuid())) }.getOrDefault(false)
    }
}

/** Move a set-aside line back into the cart, at its current price. */
class RestoreSaved(
    private val store: CartStore,
    private val repo: CartRepository,
    private val isSignedIn: () -> Boolean,
) {
    suspend operator fun invoke(variantId: String): Boolean {
        if (!isSignedIn()) return false
        return runCatching { store.adopt(repo.restoreSaved(variantId, newUuid())) }.getOrDefault(false)
    }
}

/** Discard a set-aside line. */
class DeleteSaved(
    private val store: CartStore,
    private val repo: CartRepository,
    private val isSignedIn: () -> Boolean,
) {
    suspend operator fun invoke(variantId: String): Boolean {
        if (!isSignedIn()) return false
        return runCatching { store.adopt(repo.deleteSaved(variantId, newUuid())) }.getOrDefault(false)
    }
}

/**
 * Put a past order back in the cart, and say what could not come back.
 *
 * Server-side in one call, not a client loop over the order's items. A loop would be N round trips, would
 * leave a half-reordered cart on a dropped connection, and — decisively — could not produce the report:
 * whether an item is unavailable or gone for good is only knowable where the catalogue is.
 *
 * Union-with-max, so a shopper who taps twice does not get double.
 */
class ReorderPastOrder(
    private val store: CartStore,
    private val repo: CartRepository,
    private val isSignedIn: () -> Boolean,
) {
    suspend operator fun invoke(orderId: String): ReorderOutcome? {
        if (!isSignedIn()) return null
        return runCatching {
            val outcome = repo.reorder(orderId, newUuid())
            store.adopt(outcome.cart)
            outcome
        }.getOrNull()
    }
}

/**
 * Apply a promotional code.
 *
 * Returns the refusal reason on failure rather than a bare false. "That code doesn't work" tells a
 * shopper nothing about whether to wait, spend more, or give up — and those are different answers.
 * The reason comes from the platform; this client never judges a code itself.
 *
 * Signed-in only: a per-shopper cap is unenforceable without an identity, so a guest is shown a sign-in
 * affordance where the field would be rather than a discount that might be withdrawn.
 */
class ApplyPromoCode(
    private val store: CartStore,
    private val repo: CartRepository,
    private val isSignedIn: () -> Boolean,
) {
    suspend operator fun invoke(code: String): String? {
        if (!isSignedIn()) return "Sign in to use a promotional code."
        return try {
            store.adopt(repo.applyPromo(code))
            null
        } catch (e: AppException) {
            (e.error as? AppError.Validation)?.message ?: "We couldn’t apply that code."
        }
    }
}

/** Remove the applied code; the total returns to the undiscounted amount. */
class RemovePromoCode(
    private val store: CartStore,
    private val repo: CartRepository,
    private val isSignedIn: () -> Boolean,
) {
    suspend operator fun invoke(): Boolean {
        if (!isSignedIn()) return false
        return runCatching { store.adopt(repo.removePromo()) }.getOrDefault(false)
    }
}

/** Bring the mirror up to date — cart open, app foreground, after sign-in. */
class SyncCart(private val sync: CartSyncCoordinator) {
    suspend operator fun invoke(): Boolean = sync.refresh()
}

/**
 * Fold the device cart into the account cart at sign-in: union with maximum quantity, so nothing is lost
 * and a repeat changes nothing. The local lines are cleared only after the platform acknowledges, because
 * the adopted account cart then contains them.
 */
class MergeCartOnSignIn(
    private val store: CartStore,
    private val repo: CartRepository,
) {
    suspend operator fun invoke(): Boolean {
        val lines = store.snapshot().lines
        if (lines.isEmpty()) {
            // Nothing of our own to contribute — but the account cart still has to be adopted, or a
            // shopper signing in on a fresh device would see an empty cart while the platform holds theirs.
            return runCatching { store.adopt(repo.get()) }.getOrDefault(false)
        }
        val merged = repo.merge(
            lines = lines.map { PendingLine(it.variantId, it.quantity) },
            changeId = newUuid(),
        )
        return store.adopt(merged)
    }
}
