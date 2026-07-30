package com.effyshopping.customer.mobile.features.cart.domain

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
        sync.submit(
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
