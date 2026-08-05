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
    /**
     * ⚠ 036 FR-032 — NO NAME IS TAKEN HERE ANY MORE, and 011's FR-009a is superseded.
     *
     * `given`/`family` used to ride along, because they were collected on the very first sign-up
     * screen — the first thing a stranger was asked for, before they had any reason to trust the form.
     * The name is now the LAST step of registration, written by `PATCH /customer/v1/me` once the
     * account exists and the customer is signed in.
     *
     * ✅ Safe, and it needed no infrastructure change: there is no `schema {}` block on the customer
     * pool, so Cognito's default schema applies and both attributes are OPTIONAL at `SignUp`. The
     * record's columns have been nullable since 019, deliberately, for the federated route.
     */
    suspend fun signUpWithPassword(email: String, password: String): AuthStep

    /**
     * Register with NO password, ever. Cognito's `SignUp` allows omitting the password for a
     * passwordless pool (research D7) — there is no throwaway-password hack. The resulting customer
     * genuinely has no password, which is a permanent, first-class state (FR-012).
     */
    suspend fun signUpPasswordless(email: String): AuthStep

    /** Confirm a registration code, then auto-sign-in → [AuthStep.Done]. */
    suspend fun confirmSignUp(email: String, code: String): AuthStep

    /**
     * Send the sign-UP confirmation code again (036 FR-007).
     *
     * ⚠ This is Cognito's MANAGED flow, so a real resend API exists, refusals here are genuinely
     * distinguishable, and it does NOT touch the platform's own five-per-hour custom-challenge budget.
     * ⚠ Before 036, `resendSignUpCode` was called NOWHERE in the repository — no surface on the
     * platform could resend a sign-up code, and the only recovery was to abandon the flow.
     */
    suspend fun resendSignUpCode(email: String): AuthStep

    // ── Sign-in — TWO routes, and only two ───────────────────────────────────────────────────────
    /** Password sign-in over SRP — the password never goes on the wire (the pool omits USER_PASSWORD_AUTH). */
    suspend fun signInWithPassword(email: String, password: String): AuthStep

    /** EMAIL_OTP sign-in. The preferred first factor is ALWAYS stated, to skip factor-selection (D7). */
    suspend fun signInWithEmailOtp(email: String): AuthStep

    /** Submit the emailed code for either the OTP sign-in or a sign-up confirmation → [AuthStep.Done]. */
    suspend fun confirmOtp(code: String): AuthStep

    /**
     * Send another SIGN-IN code (036 FR-007, R4).
     *
     * ⚠ NAMED FOR WHAT IT ACTUALLY DOES, BECAUSE THERE IS NO RESEND API FOR A CUSTOM CHALLENGE.
     * It re-runs `signInWithEmailOtp` from scratch. `CreateAuthChallenge` REUSES the existing envelope
     * on a re-challenge and sends no email at all — a new email requires a brand-new `InitiateAuth`.
     * Three consequences the caller owns:
     *
     *   • the 3-attempt counter RESETS (the new Cognito session starts with an empty attempt list);
     *   • the previous code becomes unreachable FROM THIS DEVICE, because the SDK overwrites the stored
     *     session. ⚠ It is NOT revoked server-side — supersession is a client-side property here;
     *   • it consumes ONE of the five hourly sends for this address, and ⚠ the SIXTH is refused while
     *     still returning a normal-looking challenge, so the shopper is shown a code screen for an
     *     email that does not exist. That is why the ViewModel counts sends.
     */
    suspend fun resendSignInCode(email: String): AuthStep

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
