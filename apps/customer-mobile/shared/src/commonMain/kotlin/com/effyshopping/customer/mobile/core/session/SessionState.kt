package com.effyshopping.customer.mobile.core.session

import com.effyshopping.customer.mobile.features.account.domain.Customer

/**
 * The root state of the app (013 data-model § 4). Everything hangs off this.
 *
 * `Restoring` is NOT `Guest` — rendering the guest home for a frame before flipping to signed-in is the
 * classic mobile flicker, so the "still checking" state is explicit. `Barred` is the *answer* to a valid
 * credential, not a swallowed error (FR-033).
 */
sealed interface SessionState {
    data object Restoring : SessionState
    data object Guest : SessionState
    data class Authenticated(val customer: Customer) : SessionState

    /** Signed in with a valid credential, but the platform record refuses access. Offers only sign-out. */
    data object Barred : SessionState
}
