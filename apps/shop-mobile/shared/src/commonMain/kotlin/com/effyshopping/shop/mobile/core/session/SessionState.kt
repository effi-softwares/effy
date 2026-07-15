package com.effyshopping.shop.mobile.core.session

import com.effyshopping.shop.mobile.features.shop.domain.Operator

/**
 * The root state of the login-first shop app (014 data-model § 3). Simpler than the customer app — there
 * is NO guest, no deferred sign-in. `Restoring` is its own state so the sign-in form never flickers in
 * before a remembered session resolves.
 */
sealed interface SessionState {
    data object Restoring : SessionState
    data object SignedOut : SessionState                     // show the email → code flow
    data class SignedIn(val operator: Operator) : SessionState
    data object Refused : SessionState                        // disabled operator / 403 on identity read
}
