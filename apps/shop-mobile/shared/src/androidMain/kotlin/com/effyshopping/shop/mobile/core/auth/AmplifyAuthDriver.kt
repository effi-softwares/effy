package com.effyshopping.shop.mobile.core.auth

import com.amplifyframework.auth.AuthChannelEventName
import com.amplifyframework.auth.cognito.AWSCognitoAuthSession
import com.amplifyframework.auth.cognito.options.AWSCognitoAuthSignInOptions
import com.amplifyframework.auth.cognito.options.AuthFlowType
import com.amplifyframework.auth.options.AuthFetchSessionOptions
import com.amplifyframework.auth.result.AuthSignInResult
import com.amplifyframework.auth.result.step.AuthSignInStep
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
 * 013 D12). NOTE the interface's deliberate absences — no sign-up, no password sign-in, no recovery, no
 * password write, no global sign-out (014 FR-008/FR-028). The ONLY credential flow is email → code.
 */
class AmplifyAuthDriver : AuthDriver {

    private val _sessionChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    override val sessionChanges: Flow<Unit> = _sessionChanges.asSharedFlow()

    // App-lifetime scope collecting Amplify's Hub, so an SDK-initiated session drop (session expiry, or
    // the Keystore-failure sign-out — 013 D11) fires sessionChanges and SessionManager re-bootstraps.
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

    override suspend fun currentSession(forceRefresh: Boolean): Session? = try {
        val options = AuthFetchSessionOptions.builder().forceRefresh(forceRefresh).build()
        val session = Amplify.Auth.fetchAuthSession(options) as AWSCognitoAuthSession
        val tokens = session.userPoolTokensResult.value
        val sub = session.userSubResult.value
        if (session.isSignedIn && tokens != null && sub != null) {
            Session(
                sub = sub,
                accessToken = tokens.accessToken.orEmpty(),
                idToken = tokens.idToken.orEmpty(),
            )
        } else {
            null
        }
    } catch (e: Throwable) {
        null
    }

    override suspend fun signInWithEmailOtp(email: String): AuthStep = step {
        // ⚠ 035 — the platform's own SIX-digit code, not Cognito's managed eight-digit EMAIL_OTP.
        // The managed factor's length is not configurable by any setting on any object, so the only
        // route to a consistent code length is a custom challenge (specs/035-six-digit-otp/).
        //
        // ⚠ WITHOUT_SRP, never CUSTOM_AUTH_WITH_SRP: the WITH_SRP variant has a recorded history of
        // returning DONE from the first signIn — issuing tokens without ever presenting the
        // challenge (amplify-android #2331/#2566, fixed twice, reported recurring at 2.11.2).
        // There is no password on this pool for SRP to verify in any case.
        //
        // ⚠ The `null` password argument is an artefact of Amplify Android's overload, which takes
        // one positionally even for a passwordless flow. It stays INSIDE this driver — the
        // commonMain AuthDriver interface has no password parameter, and must not grow one
        // (constitution Principle IV: there are no passwords on the internal audiences).
        val options = AWSCognitoAuthSignInOptions.builder()
            .authFlowType(AuthFlowType.CUSTOM_AUTH_WITHOUT_SRP)
            .build()
        mapSignIn(Amplify.Auth.signIn(email, null, options))
    }

    override suspend fun confirmOtp(code: String): AuthStep = step {
        mapSignIn(Amplify.Auth.confirmSignIn(code))
    }

    override suspend fun signOut() {
        // Local token purge only. There is no "everywhere" sign-out on this audience (014 FR-028).
        runCatching { Amplify.Auth.signOut() }
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    // ⚠ THE `else` BELOW IS WHY THIS MAPPING IS DANGEROUS TO EDIT. Kotlin does not require a `when`
    // over an enum to be exhaustive once an `else` exists, so a new Cognito step compiles perfectly
    // and fails at RUNTIME as an "Unexpected" dead end — no build error, no test failure, just a
    // shopper stuck on a screen. Every step this app accepts is therefore named explicitly, and
    // AuthStepMappingTest pins the ones that must map a particular way.
    private suspend fun mapSignIn(result: AuthSignInResult): AuthStep = when (result.nextStep.signInStep) {
        AuthSignInStep.DONE -> sessionOrFail()
        // 035 — the platform's own 6-digit code.
        AuthSignInStep.CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE ->
            AuthStep.NeedsOtp(result.nextStep.codeDeliveryDetails?.destination ?: "your email")
        // ⚠ Kept during rollout: both flows coexist on the pool, so a revert is a one-constant
        // change above (FR-033) and an in-flight managed-factor session still completes (FR-034).
        AuthSignInStep.CONFIRM_SIGN_IN_WITH_OTP ->
            AuthStep.NeedsOtp(result.nextStep.codeDeliveryDetails?.destination ?: "your email")
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
     *  import of every subtype. `UserNotFound` and `NotAuthorized` collapse to one value (FR-011). */
    private fun mapError(e: Throwable): AuthError = when (e::class.simpleName) {
        "UserNotFoundException", "NotAuthorizedException", "UserNotConfirmedException" -> AuthError.InvalidCredentials
        "CodeMismatchException" -> AuthError.CodeIncorrect
        "CodeExpiredException" -> AuthError.CodeExpired
        "LimitExceededException", "TooManyRequestsException", "TooManyFailedAttemptsException" -> AuthError.RateLimited()
        else -> AuthError.Unexpected
    }
}
