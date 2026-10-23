package com.effyshopping.driver.mobile.features.auth.domain

import com.effyshopping.driver.mobile.core.auth.AuthDriver
import com.effyshopping.driver.mobile.core.auth.AuthStep

/**
 * The auth domain layer. One class per use case, over the domain [AuthDriver] boundary — the
 * ViewModel depends on these, not the driver. Each owns input normalization (trimming) so the
 * presentation layer passes raw input and the rule lives in one place.
 *
 * The audience's rules are the absence of use cases here: there is no register / password / recovery
 * use case, because there is no such flow (Principle IV — passwordless, admin-provisioned).
 */

/** Request an emailed one-time code for [email] — the only credential flow. */
class RequestSignInCode(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String): AuthStep = authDriver.signInWithEmailOtp(email.trim())
}

/** Confirm the emailed one-time [code] → a signed-in session (or a typed failure). */
class ConfirmSignIn(private val authDriver: AuthDriver) {
    suspend operator fun invoke(code: String): AuthStep = authDriver.confirmOtp(code.trim())
}
