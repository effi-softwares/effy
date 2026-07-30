package com.effyshopping.customer.mobile.features.cart.domain

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.util.newUuid

/**
 * The cart's use cases (027) — the domain layer the UI calls, between the ViewModel/View and the
 * repository (Principle VI: presentation never reaches data directly).
 *
 * ── The one shape every mutation has ────────────────────────────────────────────────────────────
 *
 *      1. apply to the mirror          — synchronous, so the tap lands immediately (FR-014)
 *      2. submit to the coordinator    — which sends it, or drops it for a guest
 *
 * In that order, always. Reversing them would mean the UI waits on a network call before it moves, which
 * is the whole thing this design exists to avoid.
 *
 * ⚠ Each mutation mints ONE `changeId` per shopper action, here. Not per attempt — a retry reuses it, so a
 * request that arrived without its response reaching us cannot apply twice (FR-018). Minting inside the
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
                productId = line.productId,
                quantity = line.quantity,
            ),
        )
    }
}

/**
 * Set a line's quantity; 0 removes it.
 *
 * The quantity sent is ABSOLUTE, which is what will let US4 debounce ten taps into one request and drop
 * the values in between without corrupting anything.
 */
class SetCartQuantity(
    private val store: CartStore,
    private val sync: CartSyncCoordinator,
) {
    operator fun invoke(productId: String, quantity: Int) {
        store.setQuantity(productId, quantity)
        // ⚠ DEBOUNCED, unlike add: a stepper is tapped repeatedly and only the value the shopper settles on
        // matters. Safe only because the payload is absolute (FR-016/SC-005).
        sync.submitDebounced(
            PendingChange(
                changeId = newUuid(),
                kind = if (quantity <= 0) PendingChangeKind.Remove else PendingChangeKind.SetQuantity,
                productId = productId,
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
    operator fun invoke(productId: String) {
        store.remove(productId)
        sync.submit(
            PendingChange(changeId = newUuid(), kind = PendingChangeKind.Remove, productId = productId),
        )
    }
}

/** Empty the payable cart. Set-aside items survive (FR-030/FR-032). */
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
 * Move a line out of the payable cart, keeping it (FR-028).
 *
 * ⚠ Set-aside is the ONE cart operation with no local shortcut. The mirror cannot move a line between the
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
    suspend operator fun invoke(productId: String): Boolean {
        if (!isSignedIn()) return false
        return runCatching { store.adopt(repo.setAside(productId, newUuid())) }.getOrDefault(false)
    }
}

/** Move a set-aside line back into the cart, at its CURRENT price (FR-029). */
class RestoreSaved(
    private val store: CartStore,
    private val repo: CartRepository,
    private val isSignedIn: () -> Boolean,
) {
    suspend operator fun invoke(productId: String): Boolean {
        if (!isSignedIn()) return false
        return runCatching { store.adopt(repo.restoreSaved(productId, newUuid())) }.getOrDefault(false)
    }
}

/** Discard a set-aside line. */
class DeleteSaved(
    private val store: CartStore,
    private val repo: CartRepository,
    private val isSignedIn: () -> Boolean,
) {
    suspend operator fun invoke(productId: String): Boolean {
        if (!isSignedIn()) return false
        return runCatching { store.adopt(repo.deleteSaved(productId, newUuid())) }.getOrDefault(false)
    }
}

/**
 * Put a past order back in the cart (FR-034), and say what could not come back (FR-035).
 *
 * ⚠ Server-side in ONE call, not a client loop over the order's items. A loop would be N round trips, would
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
 * Apply a promotional code (FR-041).
 *
 * ⚠ Returns the REFUSAL REASON on failure rather than a bare false. "That code doesn't work" tells a
 * shopper nothing about whether to wait, spend more, or give up — and those are different answers
 * (FR-043). The reason comes from the platform; this client never judges a code itself (FR-042).
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

/** Remove the applied code; the total returns to the undiscounted amount (FR-041). */
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
 * Fold the device cart into the account cart at sign-in (FR-011/FR-012).
 *
 * ── Why this is the whole answer to "my cart isn't on my other phone" ───────────────────────────
 *
 * A guest's cart is local, and a guest sends nothing. So the moment they sign in, the device's lines have
 * to cross over — and they cross by UNION WITH MAXIMUM quantity, which means nothing is lost from either
 * side and running it twice changes nothing. That last property is what makes it safe to call on every
 * sign-in without checking whether it already ran.
 *
 * ⚠ The local lines are cleared ONLY after the platform has acknowledged the merge, and only because the
 * adopted account cart already contains them. Clearing first would lose the cart if the request failed —
 * which is exactly the class of bug 019's Option B was invented to fix, and it is not being reintroduced
 * here.
 */
class MergeCartOnSignIn(
    private val store: CartStore,
    private val repo: CartRepository,
) {
    suspend operator fun invoke(): Boolean {
        val lines = store.snapshot().lines
        if (lines.isEmpty()) {
            // Nothing of our own to contribute — but the ACCOUNT cart still has to be adopted, or a
            // shopper signing in on a fresh device would see an empty cart while the platform holds theirs.
            return runCatching { store.adopt(repo.get()) }.getOrDefault(false)
        }
        val merged = repo.merge(
            lines = lines.map { PendingLine(it.productId, it.quantity) },
            changeId = newUuid(),
        )
        return store.adopt(merged)
    }
}
