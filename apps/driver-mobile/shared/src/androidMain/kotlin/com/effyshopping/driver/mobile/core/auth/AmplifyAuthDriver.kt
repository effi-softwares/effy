package com.effyshopping.driver.mobile.core.auth

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
 * [AuthDriver] over Amplify Android, configured at startup from the in-code config string. The only
 * credential flow is email → code.
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

    /**
     * `isSignedIn` is read from the credentials stored on the device, so it answers with no signal
     * when `currentSession` cannot, because the tokens could not be refreshed (backlog C3).
     */
    override suspend fun holdsSignIn(): Boolean = try {
        Amplify.Auth.fetchAuthSession().isSignedIn
    } catch (e: Throwable) {
        false
    }

    override suspend fun signInWithEmailOtp(email: String): AuthStep = step {
        // The platform's own six-digit code (a custom challenge), not Cognito's eight-digit EMAIL_OTP.
        // CUSTOM_AUTH_WITHOUT_SRP, never WITH_SRP, which has returned done from the first signIn without
        // presenting the challenge (amplify-android #2331/#2566); there is no password to verify anyway.
        // The `null` password is Amplify's positional overload and stays inside this driver: the
        // interface has no password parameter and must not grow one.
        val options = AWSCognitoAuthSignInOptions.builder()
            .authFlowType(AuthFlowType.CUSTOM_AUTH_WITHOUT_SRP)
            .build()
        mapSignIn(Amplify.Auth.signIn(email, null, options))
    }

    override suspend fun confirmOtp(code: String): AuthStep = step {
        mapSignIn(Amplify.Auth.confirmSignIn(code))
    }

    override suspend fun signOut() {
        // Local token purge only. There is no "everywhere" sign-out on this audience.
        runCatching { Amplify.Auth.signOut() }
    }

    // helpers

    // The `else` below is why this mapping is dangerous to edit. Kotlin does not require a `when`
    // over an enum to be exhaustive once an `else` exists, so a new Cognito step compiles perfectly
    // and fails at runtime as an "Unexpected" dead end — no build error, no test failure, just a
    // shopper stuck on a screen. Every step this app accepts is therefore named explicitly, and
    // AuthStepMappingTest pins the ones that must map a particular way.
    private suspend fun mapSignIn(result: AuthSignInResult): AuthStep = when (result.nextStep.signInStep) {
        AuthSignInStep.DONE -> sessionOrFail()
        // The platform's own 6-digit code.
        AuthSignInStep.CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE ->
            AuthStep.NeedsOtp(result.nextStep.codeDeliveryDetails?.destination ?: "your email")
        // Kept during rollout: both flows coexist on the pool, so a revert is a one-constant
        // change above and an in-flight managed-factor session still completes.
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
     *  import of every subtype. `UserNotFound` and `NotAuthorized` collapse to one value. */
    private fun mapError(e: Throwable): AuthError = when (e::class.simpleName) {
        "UserNotFoundException", "NotAuthorizedException", "UserNotConfirmedException" -> AuthError.InvalidCredentials
        "CodeMismatchException" -> AuthError.CodeIncorrect
        "CodeExpiredException" -> AuthError.CodeExpired
        "LimitExceededException", "TooManyRequestsException", "TooManyFailedAttemptsException" -> AuthError.RateLimited()
        else -> if (isNetworkFailure(e)) AuthError.Network else AuthError.Unexpected
    }

    /**
     * Amplify reports no signal as a generic `UnknownException` (or `NetworkException`) with the
     * socket error underneath, so the cause chain is what tells "offline" apart from a fault.
     */
    private fun isNetworkFailure(e: Throwable): Boolean =
        generateSequence(e) { it.cause.takeIf { c -> c !== it } }.take(8).any {
            it is java.io.IOException ||
                it::class.simpleName.orEmpty().let { n -> "Network" in n || "Timeout" in n }
        }
}
