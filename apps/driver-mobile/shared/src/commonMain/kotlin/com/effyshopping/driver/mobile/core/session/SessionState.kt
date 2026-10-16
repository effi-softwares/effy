package com.effyshopping.driver.mobile.core.session

import com.effyshopping.driver.mobile.features.driver.domain.Driver

/**
 * The root state of the login-first driver app (049). Like shop-mobile there is NO guest and no
 * deferred sign-in. `Restoring` is its own state so the sign-in form never flickers in before a
 * remembered session resolves.
 */
sealed interface SessionState {
    data object Restoring : SessionState
    data object SignedOut : SessionState                  // show the email → code flow
    /**
     * [offline] — opened with no signal from the record kept on the phone (backlog C3). The session
     * could not be checked, which is not the same as signed out; it is checked again on reconnect.
     */
    data class SignedIn(val driver: Driver, val offline: Boolean = false) : SessionState
    data object Refused : SessionState                     // disabled/not-provisioned driver (403 on /me)
}
