package com.effyshopping.shop.mobile.features.auth.domain

import com.effyshopping.shop.mobile.core.auth.AuthDriver
import com.effyshopping.shop.mobile.core.auth.AuthStep

/**
 * The auth domain layer (014). One class per use case, over the domain [AuthDriver] boundary — the
 * ViewModel depends on THESE, not the driver. Each owns input normalization (trimming) so the
 * presentation layer passes raw input and the rule lives in one place.
 *
 * The audience's rules are the ABSENCE of use cases here: there is no register / password / recovery
 * use case, because there is no such flow (Principle IV — passwordless, admin-provisioned).
 */

/** Request an emailed one-time code for [email] — the ONLY credential flow. */
class RequestSignInCode(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String): AuthStep = authDriver.signInWithEmailOtp(email.trim())
}

/** Confirm the emailed one-time [code] → a signed-in session (or a typed failure). */
class ConfirmSignIn(private val authDriver: AuthDriver) {
    suspend operator fun invoke(code: String): AuthStep = authDriver.confirmOtp(code.trim())
}
