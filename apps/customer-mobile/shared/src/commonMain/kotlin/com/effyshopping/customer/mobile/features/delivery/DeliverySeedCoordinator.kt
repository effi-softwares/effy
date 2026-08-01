package com.effyshopping.customer.mobile.features.delivery

import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Seeds the delivery location from the signed-in shopper's default address, and drops it again on
 * sign-out (030 US2 / FR-018, FR-023).
 *
 * ── Why this exists at all ─────────────────────────────────────────────────────────────────────
 *
 * 025's FR-013 requires the storefront to "reuse a signed-in shopper's existing default address where
 * one exists". [DeliveryContextStore.seedFromAccount] was written for it and **called by nobody**, on
 * either surface — so a shopper who had already told Effy where they live was still asked to type a
 * postcode. This is where that finally gets wired, three features late.
 *
 * ── ⚠ Why a session observer and not a screen ──────────────────────────────────────────────────
 *
 * Doing this in `HomeScreen` would mean it never runs if the shopper's first stop is another tab, and
 * would re-run on every recomposition. Observing the session runs it exactly once per sign-in,
 * wherever they happen to be.
 *
 * ── ⚠ The rules it must not break ──────────────────────────────────────────────────────────────
 *
 *  • **An explicit choice outranks the account default** (FR-019). Enforced by `seedFromAccount`
 *    itself, which is a no-op when anything is already set — not re-implemented here.
 *  • **It never writes to the account** (FR-021). It reads the address book; a delivery location is a
 *    device preference and becomes an address only through the address book.
 *  • **An unserved default is still seeded** (FR-024). This does not filter on serviceability — a
 *    shopper whose own default address is outside the delivery area must be told so plainly, not
 *    silently shown "Set your delivery location" as though we had never heard of them.
 *  • **Sign-out drops an ACCOUNT-derived place, keeps a device one** (FR-023) — see
 *    [DeliveryContextStore.clearAccountContext]. The device may not be the shopper's alone.
 */
class DeliverySeedCoordinator(
    private val store: DeliveryContextStore,
    private val listAddresses: suspend () -> List<SavedAddress>,
    private val scope: CoroutineScope,
) {
    fun start(session: StateFlow<SessionState>) {
        scope.launch {
            session
                .map { it is SessionState.Authenticated }
                .distinctUntilChanged()
                .collect { signedIn -> if (signedIn) seed() else store.clearAccountContext() }
        }
    }

    private suspend fun seed() {
        // Cheap guard before any network call: an explicit choice already wins, so there is nothing
        // to seed and no reason to read the address book.
        if (store.state.value != null) return

        val preferred = runCatching { listAddresses() }
            .getOrElse { return } // ⚠ A failed read leaves the shopper to set it themselves. Never an error.
            .let { list -> list.firstOrNull { it.isDefault } ?: list.firstOrNull() }
            ?: return

        store.seedFromAccount(
            postcode = preferred.postalCode,
            // `city` is the suburb on this model; `region` is the state and is NULLABLE on existing
            // addresses, so the display falls back to the bare postcode rather than inventing one.
            locality = preferred.city.ifBlank { null },
            state = preferred.region?.ifBlank { null },
        )
    }
}
