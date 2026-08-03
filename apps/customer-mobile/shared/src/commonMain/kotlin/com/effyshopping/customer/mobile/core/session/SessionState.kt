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

    /**
     * The customer asked to be deleted and the grace window is running (034 FR-041a).
     *
     * ⚠ A DISTINCT STATE FROM [Barred], and the distinction is the whole point: barred is a sanction
     * the PLATFORM imposed and offers the customer nothing but sign-out; closing is the customer's OWN
     * decision and MUST offer them a way back. Collapsing the two would strand someone who changed
     * their mind inside a screen that only says "contact support".
     */
    data object Closing : SessionState
}

/**
 * The write side of the session, narrowed to what a feature ViewModel actually needs (034 T024).
 *
 * ⚠ Exists so a ViewModel depends on TWO METHODS rather than on the whole [SessionManager], which
 * drags in an `AuthDriver`, a `GetCustomer` use case and a coroutine scope. That is the difference
 * between a ViewModel test that constructs a fake in three lines and one that has to stand up the
 * entire auth stack — and a test that is expensive to write is a test that does not get written.
 */
interface SessionWriter {
    fun setAuthenticated(customer: com.effyshopping.customer.mobile.features.account.domain.Customer)

    fun setBarred()
}
