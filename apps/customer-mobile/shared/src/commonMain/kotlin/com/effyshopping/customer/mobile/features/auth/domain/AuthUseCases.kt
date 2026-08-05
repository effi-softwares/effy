package com.effyshopping.customer.mobile.features.auth.domain

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.auth.AuthStep
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository

/**
 * The auth domain layer (013). One class per use case, over the domain [AuthDriver] boundary — the
 * ViewModel depends on THESE, not the driver. Each owns input normalization (trim email + names; NEVER
 * a password — leading/trailing characters can be significant) so the rule lives in one place.
 *
 * The customer audience is the ONLY one with registration + password + recovery, so these use cases
 * exist here and not in the shop app (Principle IV, per-audience).
 */

/**
 * Register with a password (one of the customer's three routes).
 *
 * ⚠ 036 FR-032 — NO NAME. It is collected as the LAST step, after the account exists.
 */
class RegisterWithPassword(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String, password: String): AuthStep =
        authDriver.signUpWithPassword(email.trim(), password)
}

/** Register passwordless (a genuinely passwordless customer — no password seeded). */
class RegisterPasswordless(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String): AuthStep = authDriver.signUpPasswordless(email.trim())
}

/** Confirm a registration's emailed code. [email] is the route's stored (already-normalized) address. */
class ConfirmSignUp(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String, code: String): AuthStep =
        authDriver.confirmSignUp(email, code.trim())
}

/** Sign in with email + password. */
class SignInWithPassword(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String, password: String): AuthStep =
        authDriver.signInWithPassword(email.trim(), password)
}

/** Sign in by emailed one-time code (request the code). */
class SignInWithEmailOtp(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String): AuthStep = authDriver.signInWithEmailOtp(email.trim())
}

/**
 * Send another SIGN-IN code (036 FR-007).
 *
 * ⚠ Named for what it does. There is no resend API for a custom challenge — this re-runs sign-in,
 * which resets the attempt counter and consumes one of five hourly sends. See [AuthDriver].
 */
class ResendSignInCode(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String): AuthStep = authDriver.resendSignInCode(email.trim())
}

/** Send the sign-UP confirmation code again — Cognito's managed resend, a genuinely different call. */
class ResendSignUpCode(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String): AuthStep = authDriver.resendSignUpCode(email.trim())
}

/** Confirm a sign-in one-time code. */
class ConfirmOtp(private val authDriver: AuthDriver) {
    suspend operator fun invoke(code: String): AuthStep = authDriver.confirmOtp(code.trim())
}

/** Begin account recovery — email a reset code. Recovery FINISHES at the backend (never the SDK). */
class StartPasswordReset(private val authDriver: AuthDriver) {
    suspend operator fun invoke(email: String): AuthStep = authDriver.startPasswordReset(email.trim())
}

/**
 * Finish recovery via the BACKEND (FR-015) — not the SDK, which would corrupt `has_password`. Lives on
 * [CustomerRepository], not the driver, which is exactly why recovery converges on one profile.
 */
class ConfirmPasswordReset(private val customers: CustomerRepository) {
    suspend operator fun invoke(email: String, code: String, newPassword: String) =
        customers.confirmPasswordReset(email.trim(), code.trim(), newPassword)
}
