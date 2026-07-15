package com.effyshopping.customer.mobile.core.auth

import kotlinx.coroutines.flow.Flow

/**
 * The platform auth boundary (013 contracts/auth-driver.contract.md; research D5/D6/D8).
 *
 * ONE interface in commonMain; two implementations: `AmplifyAuthDriver` on Android (Amplify Android,
 * Kotlin/JVM) and a Swift `SwiftAuthDriver` on iOS (Amplify Swift — unreachable from Kotlin/Native, so
 * Swift implements this interface and is INJECTED into the shared module). This is NOT `expect class`:
 * that is Beta, warns, and could not host a Swift implementation.
 *
 * ── WHAT IS DELIBERATELY ABSENT IS THE SECURITY PROPERTY ──────────────────────────────────────────
 * There is no `updatePassword`, no `globalSignOut`, and no `confirmResetPassword` here, and there
 * never will be. Cognito's `ChangePassword` PERMITS OMITTING THE PREVIOUS PASSWORD when the user has
 * none — an account-takeover primitive (012/FR-024) that IAM cannot close. Password writes and
 * sign-out-everywhere go to the BACKEND, which verifies a freshly-emailed step-up code in the same
 * request that writes the password. Amplify's high-level API happens to block the dangerous call, but
 * that is a type-level accident, not a guard — and the escape hatch reaches the raw call, so
 * `scripts/mobile-guard.sh` fails the build on any reference to it. If a method for changing a
 * password appears on this interface, the vulnerability is one call away on the surface most likely to
 * reintroduce it. Keep it off.
 */
interface AuthDriver {

    /**
     * Emits when the SDK drops the session WITHOUT the app asking — chiefly Amplify Android recreating
     * a broken Keystore master key, which silently invalidates the stored tokens (research D11). The
     * app treats this as a real state ("signed out unexpectedly"), never a swallowed error.
     */
    val sessionChanges: Flow<Unit>

    /** The current session, or null if signed out. [forceRefresh] renews via Amplify (never raw HTTP). */
    suspend fun currentSession(forceRefresh: Boolean = false): Session?

    // ── Registration — TWO routes, and only two ──────────────────────────────────────────────────
    suspend fun signUpWithPassword(email: String, password: String, given: String, family: String): AuthStep

    /**
     * Register with NO password, ever. Cognito's `SignUp` allows omitting the password for a
     * passwordless pool (research D7) — there is no throwaway-password hack. The resulting customer
     * genuinely has no password, which is a permanent, first-class state (FR-012).
     */
    suspend fun signUpPasswordless(email: String, given: String, family: String): AuthStep

    /** Confirm a registration code, then auto-sign-in → [AuthStep.Done]. */
    suspend fun confirmSignUp(email: String, code: String): AuthStep

    // ── Sign-in — TWO routes, and only two ───────────────────────────────────────────────────────
    /** Password sign-in over SRP — the password never goes on the wire (the pool omits USER_PASSWORD_AUTH). */
    suspend fun signInWithPassword(email: String, password: String): AuthStep

    /** EMAIL_OTP sign-in. The preferred first factor is ALWAYS stated, to skip factor-selection (D7). */
    suspend fun signInWithEmailOtp(email: String): AuthStep

    /** Submit the emailed code for either the OTP sign-in or a sign-up confirmation → [AuthStep.Done]. */
    suspend fun confirmOtp(code: String): AuthStep

    /**
     * START account recovery (emails a code). It FINISHES at the backend
     * (`POST /customer/v1/password/reset-confirm`), never via the SDK's `confirmResetPassword` — that
     * would bypass breach screening and corrupt `has_password` (contract § 6). Hence there is no
     * `confirmPasswordReset` on this interface.
     */
    suspend fun startPasswordReset(email: String): AuthStep

    /** LOCAL sign-out only — purge this device's tokens. "Everywhere" is the backend's DELETE /sessions. */
    suspend fun signOut()
}
