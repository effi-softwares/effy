package com.effyshopping.shop.mobile.core.auth

import com.amplifyframework.auth.AuthChannelEventName
import com.amplifyframework.auth.AuthFactorType
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
        // ALWAYS state the preferred factor — omitting it forces a factor-selection round-trip (013 D7).
        val options = AWSCognitoAuthSignInOptions.builder()
            .authFlowType(AuthFlowType.USER_AUTH)
            .preferredFirstFactor(AuthFactorType.EMAIL_OTP)
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

    private suspend fun mapSignIn(result: AuthSignInResult): AuthStep = when (result.nextStep.signInStep) {
        AuthSignInStep.DONE -> sessionOrFail()
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
