package com.effyshopping.customer.mobile.core.auth

import com.amplifyframework.auth.AuthUserAttribute
import com.amplifyframework.auth.AuthUserAttributeKey
import com.amplifyframework.auth.cognito.AWSCognitoAuthSession
import com.amplifyframework.auth.cognito.exceptions.invalidstate.SignedInException
import com.amplifyframework.auth.cognito.options.AWSCognitoAuthSignInOptions
import com.amplifyframework.auth.cognito.options.AuthFlowType
import com.amplifyframework.auth.options.AuthFetchSessionOptions
import com.amplifyframework.auth.options.AuthSignUpOptions
import com.amplifyframework.auth.result.AuthSignInResult
import com.amplifyframework.auth.result.step.AuthSignInStep
import com.amplifyframework.auth.AuthChannelEventName
import com.amplifyframework.hub.HubChannel
import com.amplifyframework.kotlin.core.Amplify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

/**
 * The Android implementation of [AuthDriver], over Amplify Android (Kotlin coroutines facade).
 *
 * Amplify must be configured before this is used (done at app startup from the in-code config string,
 * D12). NOTE the interface's deliberate absences: no password write, no global sign-out, no escape
 * hatch (013 D8) — those go to the backend, and the build guard forbids the escape hatch.
 */
class AmplifyAuthDriver : AuthDriver {

    private val _sessionChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    override val sessionChanges: Flow<Unit> = _sessionChanges.asSharedFlow()

    // App-lifetime scope collecting Amplify's Hub, so an SDK-initiated session drop (session expiry, or
    // the Keystore-failure sign-out — D11) actually fires sessionChanges and SessionManager re-bootstraps.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    init {
        scope.launch {
            Amplify.Hub.subscribe(HubChannel.AUTH).collect { event ->
                if (event.name == AuthChannelEventName.SESSION_EXPIRED.toString() ||
                    event.name == AuthChannelEventName.SIGNED_OUT.toString()
                ) {
                    _sessionChanges.tryEmit(Unit)
                }
            }
        }
    }

    /**
     * ⚠ THIS RECONCILES; it does not merely read. Kept identical to the iOS bridge's `fetchSession`.
     *
     * A session that reports `isSignedIn` but cannot produce a token — an expired refresh token, or on
     * iOS a Keychain entry that outlived the install that made it — used to be reported as simply "no
     * session". That left Amplify holding a signed-in user while the app showed a guest, and every
     * subsequent `signIn` failed with *"There is already a user in signedIn state"*.
     *
     * ⚠ This is NOT the only way the two stores diverge, and probably not the common one.
     * `SessionManager` deliberately falls back to Guest when the customer record cannot be read at
     * launch — a backend outage should not log anyone out, and its own comment says "the Amplify
     * session survives for a relaunch". That path produces the same standoff with a session that is
     * perfectly VALID, so this method cannot see it; [signInRecoveringFromStaleSession] is what
     * actually covers it.
     *
     * ⚠ Reported on **iOS**, fixed on both. Android's credential store goes with the app data, which
     * hides the reinstall half of the problem rather than fixing it — but the SessionManager half is
     * platform-neutral and bites here identically.
     */
    override suspend fun currentSession(forceRefresh: Boolean): Session? = try {
        val options = AuthFetchSessionOptions.builder().forceRefresh(forceRefresh).build()
        val session = Amplify.Auth.fetchAuthSession(options) as AWSCognitoAuthSession
        val tokens = session.userPoolTokensResult.value
        val sub = session.userSubResult.value
        if (session.isSignedIn && tokens != null && sub != null) {
            Session(
                sub = sub,
                idToken = tokens.idToken.orEmpty(),
                accessToken = tokens.accessToken.orEmpty(),
            )
        } else {
            // Signed in on paper, unusable in practice — clear it rather than leave the two stores
            // disagreeing. Best-effort: if the purge fails there is nothing further to try here.
            if (session.isSignedIn) runCatching { Amplify.Auth.signOut() }
            null
        }
    } catch (e: Throwable) {
        clearStaleSessionIfAny()
        null
    }

    override suspend fun signUpWithPassword(email: String, password: String): AuthStep =
        step {
            val result = Amplify.Auth.signUp(email, password, signUpOptions(email))
            if (result.isSignUpComplete) autoSignIn() else AuthStep.NeedsSignUpConfirmation(email)
        }

    override suspend fun signUpPasswordless(email: String): AuthStep =
        step {
            // No password parameter — Cognito creates a genuinely passwordless user (D7).
            val result = Amplify.Auth.signUp(email, null, signUpOptions(email))
            if (result.isSignUpComplete) autoSignIn() else AuthStep.NeedsSignUpConfirmation(email)
        }

    override suspend fun confirmSignUp(email: String, code: String): AuthStep = step {
        val result = Amplify.Auth.confirmSignUp(email, code)
        if (result.isSignUpComplete) autoSignIn() else AuthStep.Failed(AuthError.Unexpected)
    }

    override suspend fun signInWithPassword(email: String, password: String): AuthStep = step {
        val options = AWSCognitoAuthSignInOptions.builder().authFlowType(AuthFlowType.USER_SRP_AUTH).build()
        mapSignIn(signInRecoveringFromStaleSession { Amplify.Auth.signIn(email, password, options) })
    }

    override suspend fun signInWithEmailOtp(email: String): AuthStep = step {
        // ⚠ 035 — the platform's own SIX-digit code, not Cognito's managed eight-digit EMAIL_OTP
        // (whose length is not configurable by any setting on any object).
        // ⚠ WITHOUT_SRP, never CUSTOM_AUTH_WITH_SRP: the WITH_SRP variant has a recorded history of
        // returning DONE from the first signIn — issuing tokens without presenting the challenge
        // (amplify-android #2331/#2566, fixed twice, reported recurring).
        // ⚠ This is the CODE route only. The password route above keeps USER_SRP_AUTH — the customer
        // audience is the one audience that may hold a password (constitution v1.7.0).
        val options = AWSCognitoAuthSignInOptions.builder()
            .authFlowType(AuthFlowType.CUSTOM_AUTH_WITHOUT_SRP)
            .build()
        mapSignIn(signInRecoveringFromStaleSession { Amplify.Auth.signIn(email, null, options) })
    }

    override suspend fun confirmOtp(code: String): AuthStep = step {
        mapSignIn(Amplify.Auth.confirmSignIn(code))
    }

    override suspend fun resendSignUpCode(email: String): AuthStep = step {
        // Cognito's MANAGED resend — a real API, unlike the sign-in code (see `resendSignInCode`).
        val details = Amplify.Auth.resendSignUpCode(email)
        AuthStep.NeedsSignUpConfirmation(details.destination ?: email)
    }

    /**
     * ⚠ NOT A RESEND — a fresh sign-in. See the note on `AuthDriver.resendSignInCode`: the custom
     * challenge has no resend API, `CreateAuthChallenge` reuses its envelope on a re-challenge and
     * sends no email, so only a brand-new `InitiateAuth` produces one.
     */
    override suspend fun resendSignInCode(email: String): AuthStep = signInWithEmailOtp(email)

    override suspend fun startPasswordReset(email: String): AuthStep = step {
        Amplify.Auth.resetPassword(email)
        AuthStep.NeedsOtp(email) // the code is emailed; recovery FINISHES at the backend, not the SDK
    }

    override suspend fun signOut() {
        // Local token purge. "Everywhere" is the backend's DELETE /sessions, never called from here.
        runCatching { Amplify.Auth.signOut() }
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    /** Sign out only if Amplify still believes someone is signed in. */
    private suspend fun clearStaleSessionIfAny() {
        val stillSignedIn = runCatching { Amplify.Auth.fetchAuthSession().isSignedIn }.getOrDefault(false)
        if (stillSignedIn) runCatching { Amplify.Auth.signOut() }
    }

    /**
     * Run a sign-in, and if Amplify refuses because a user is already signed in, clear that user and
     * try once more.
     *
     * This is Amplify's own documented recovery ("SignOut the user first before calling signIn"), and
     * it belongs at the driver rather than in a use case: a stale SDK session is an SDK concern. The
     * closed [AuthError] set (FR-016) has no member for it and should not grow one — the domain has no
     * decision to make here, and the customer certainly does not.
     *
     * ⚠ Retried EXACTLY once. A second failure is reported, so a genuine invalid-state bug surfaces
     * instead of spinning. `SignedInException` is matched by TYPE, never by message text — and it is the
     * precise subtype, not its `InvalidStateException` parent, so unrelated invalid states are not
     * retried on the strength of sharing a base class.
     */
    private suspend fun signInRecoveringFromStaleSession(
        attempt: suspend () -> AuthSignInResult,
    ): AuthSignInResult = try {
        attempt()
    } catch (e: SignedInException) {
        runCatching { Amplify.Auth.signOut() }
        attempt()
    }

    /**
     * ⚠ 036 FR-032 — the NAME attributes are gone. They are optional on the pool (no `schema {}`
     * block), so registration is unaffected; the name is written after the account exists.
     */
    private fun signUpOptions(email: String): AuthSignUpOptions =
        AuthSignUpOptions.builder()
            .userAttributes(listOf(AuthUserAttribute(AuthUserAttributeKey.email(), email)))
            .build()

    /**
     * ⚠ 036 R6 — THIS DEAD-ENDED ON ANDROID WHILE iOS HANDLED IT CORRECTLY.
     *
     * It used to read `if (result.isSignedIn) sessionOrFail() else AuthStep.Failed(Unexpected)`. So a
     * `CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` — which `autoSignIn` MAY return now that custom-auth
     * triggers are attached to this pool — became a hard "something went wrong": the shopper was
     * confirmed but not signed in, shown a generic error, with no route forward. iOS ran the same
     * result through `mapSignIn` and would have rendered the code screen.
     *
     * ⚠ Whether the challenge actually occurs is 035's still-open T003 / 036's SPIKE-2, and AWS
     * documents it nowhere. Routing through `mapSignIn` makes the answer stop mattering for
     * correctness: whatever step comes back is handled the same way it is everywhere else.
     */
    private suspend fun autoSignIn(): AuthStep = mapSignIn(Amplify.Auth.autoSignIn())

    // ⚠ THE `else` BELOW IS A SILENT-FAILURE HAZARD. Kotlin does not require this `when` to be
    // exhaustive once an `else` exists, so an unhandled Cognito step compiles cleanly and dies at
    // RUNTIME as an "Unexpected" dead end — no build error, no test failure, just a shopper stuck.
    // Every step this app accepts is named explicitly.
    private suspend fun mapSignIn(result: AuthSignInResult): AuthStep = when (result.nextStep.signInStep) {
        AuthSignInStep.DONE -> sessionOrFail()
        // 035 — the platform's own 6-digit code.
        AuthSignInStep.CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE ->
            AuthStep.NeedsOtp(result.nextStep.codeDeliveryDetails?.destination ?: "your email")
        // ⚠ Kept during rollout: both flows coexist on the pool, so a revert is a one-constant
        // change above (FR-033) and an in-flight managed-factor session still completes (FR-034).
        AuthSignInStep.CONFIRM_SIGN_IN_WITH_OTP ->
            AuthStep.NeedsOtp(result.nextStep.codeDeliveryDetails?.destination ?: "your email")
        AuthSignInStep.CONFIRM_SIGN_UP ->
            AuthStep.NeedsSignUpConfirmation(result.nextStep.codeDeliveryDetails?.destination ?: "your email")
        else -> AuthStep.Failed(AuthError.Unexpected)
    }

    private suspend fun sessionOrFail(): AuthStep =
        currentSession()?.let { AuthStep.Done(it) } ?: AuthStep.Failed(AuthError.Unexpected)

    private inline fun step(block: () -> AuthStep): AuthStep =
        try {
            block()
        } catch (e: Throwable) {
            AuthStep.Failed(mapError(e))
        }

    /** Map Amplify exceptions to the closed [AuthError] — matching by simple name to avoid a fragile
     *  import of every subtype. `UserNotFound` and `NotAuthorized` collapse to one value (FR-016). */
    private fun mapError(e: Throwable): AuthError = when (e::class.simpleName) {
        "UserNotFoundException", "NotAuthorizedException", "UserNotConfirmedException" -> AuthError.InvalidCredentials
        "CodeMismatchException" -> AuthError.CodeIncorrect
        "CodeExpiredException" -> AuthError.CodeExpired
        "LimitExceededException", "TooManyRequestsException", "TooManyFailedAttemptsException" -> AuthError.RateLimited()
        else -> AuthError.Unexpected
    }
}
