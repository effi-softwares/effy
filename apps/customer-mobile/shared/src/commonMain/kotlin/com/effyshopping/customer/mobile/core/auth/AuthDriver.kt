package com.effyshopping.customer.mobile.core.auth

import kotlinx.coroutines.flow.Flow

/**
 * The platform auth boundary: `AmplifyAuthDriver` on Android and a Swift `SwiftAuthDriver` on iOS (Amplify
 * Swift is unreachable from Kotlin/Native, so Swift implements this and is injected). Not `expect class`
 * (Beta, and it cannot host a Swift implementation).
 *
 * There is no `updatePassword`, `globalSignOut` or `confirmResetPassword`, and never will be: Cognito's
 * `ChangePassword` allows omitting the previous password when the user has none, an account-takeover
 * primitive. Password writes and sign-out-everywhere go to the backend, which verifies an emailed step-up
 * code in the same request. `scripts/mobile-guard.sh` fails the build on any reference to the raw call.
 */
interface AuthDriver {

    /**
     * Emits when the SDK drops the session without the app asking — chiefly Amplify Android recreating
     * a broken Keystore master key, which silently invalidates the stored tokens. The
     * app treats this as a real state ("signed out unexpectedly"), never a swallowed error.
     */
    val sessionChanges: Flow<Unit>

    /** The current session, or null if signed out. [forceRefresh] renews via Amplify (never raw HTTP). */
    suspend fun currentSession(forceRefresh: Boolean = false): Session?

    // Registration: two routes
    /** No name here: it is the last registration step (`PATCH /customer/v1/me`); both attributes are optional at `SignUp`. */
    suspend fun signUpWithPassword(email: String, password: String): AuthStep

    /**
     * Register with NO password, ever. Cognito's `SignUp` allows omitting the password for a
     * passwordless pool — there is no throwaway-password hack. The resulting customer
     * genuinely has no password, which is a permanent, first-class state.
     */
    suspend fun signUpPasswordless(email: String): AuthStep

    /** Confirm a registration code, then auto-sign-in → [AuthStep.Done]. */
    suspend fun confirmSignUp(email: String, code: String): AuthStep

    /** Resend the sign-up confirmation code (Cognito's managed flow; outside the platform's five-per-hour code budget). */
    suspend fun resendSignUpCode(email: String): AuthStep

    // Sign-in — two routes, and only two
    /** Password sign-in over SRP — the password never goes on the wire (the pool omits USER_PASSWORD_AUTH). */
    suspend fun signInWithPassword(email: String, password: String): AuthStep

    /** EMAIL_OTP sign-in. The preferred first factor is always stated, to skip factor-selection. */
    suspend fun signInWithEmailOtp(email: String): AuthStep

    /** Submit the emailed code for either the OTP sign-in or a sign-up confirmation → [AuthStep.Done]. */
    suspend fun confirmOtp(code: String): AuthStep

    /**
     * Send another sign-in code.
     *
     * Named for what it actually does, because there is no resend API for a custom challenge.
     * It re-runs `signInWithEmailOtp` from scratch. `CreateAuthChallenge` reuses the existing envelope
     * on a re-challenge and sends no email at all — a new email requires a brand-new `InitiateAuth`.
     * Three consequences the caller owns:
     *
     *  • the 3-attempt counter resets (the new Cognito session starts with an empty attempt list);
     *  • the previous code becomes unreachable from this device, because the SDK overwrites the stored
     *  session. It is not revoked server-side — supersession is a client-side property here;
     *  • it consumes one of the five hourly sends for this address, and the sixth is refused while
     *  still returning a normal-looking challenge, so the shopper is shown a code screen for an
     *  email that does not exist. That is why the ViewModel counts sends.
     */
    suspend fun resendSignInCode(email: String): AuthStep

    /**
     * Start account recovery (emails a code). It finishes at the backend
     * (`POST /customer/v1/password/reset-confirm`), never via the sdk's `confirmResetPassword` — that
     * would bypass breach screening and corrupt `has_password` (contract § 6). Hence there is no
     * `confirmPasswordReset` on this interface.
     */
    suspend fun startPasswordReset(email: String): AuthStep

    /** Local sign-out only — purge this device's tokens. "Everywhere" is the backend's DELETE /sessions. */
    suspend fun signOut()
}
