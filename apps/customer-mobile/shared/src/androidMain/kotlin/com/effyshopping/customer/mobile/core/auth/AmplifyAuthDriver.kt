package com.effyshopping.customer.mobile.core.auth

import com.amplifyframework.auth.AuthFactorType
import com.amplifyframework.auth.AuthUserAttribute
import com.amplifyframework.auth.AuthUserAttributeKey
import com.amplifyframework.auth.cognito.AWSCognitoAuthSession
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
            null
        }
    } catch (e: Throwable) {
        null
    }

    override suspend fun signUpWithPassword(email: String, password: String, given: String, family: String): AuthStep =
        step {
            val result = Amplify.Auth.signUp(email, password, signUpOptions(email, given, family))
            if (result.isSignUpComplete) autoSignIn() else AuthStep.NeedsSignUpConfirmation(email)
        }

    override suspend fun signUpPasswordless(email: String, given: String, family: String): AuthStep =
        step {
            // No password parameter — Cognito creates a genuinely passwordless user (D7).
            val result = Amplify.Auth.signUp(email, null, signUpOptions(email, given, family))
            if (result.isSignUpComplete) autoSignIn() else AuthStep.NeedsSignUpConfirmation(email)
        }

    override suspend fun confirmSignUp(email: String, code: String): AuthStep = step {
        val result = Amplify.Auth.confirmSignUp(email, code)
        if (result.isSignUpComplete) autoSignIn() else AuthStep.Failed(AuthError.Unexpected)
    }

    override suspend fun signInWithPassword(email: String, password: String): AuthStep = step {
        val options = AWSCognitoAuthSignInOptions.builder().authFlowType(AuthFlowType.USER_SRP_AUTH).build()
        mapSignIn(Amplify.Auth.signIn(email, password, options))
    }

    override suspend fun signInWithEmailOtp(email: String): AuthStep = step {
        // ALWAYS state the preferred factor — omitting it forces a factor-selection round-trip (D7).
        val options = AWSCognitoAuthSignInOptions.builder()
            .authFlowType(AuthFlowType.USER_AUTH)
            .preferredFirstFactor(AuthFactorType.EMAIL_OTP)
            .build()
        mapSignIn(Amplify.Auth.signIn(email, null, options))
    }

    override suspend fun confirmOtp(code: String): AuthStep = step {
        mapSignIn(Amplify.Auth.confirmSignIn(code))
    }

    override suspend fun startPasswordReset(email: String): AuthStep = step {
        Amplify.Auth.resetPassword(email)
        AuthStep.NeedsOtp(email) // the code is emailed; recovery FINISHES at the backend, not the SDK
    }

    override suspend fun signOut() {
        // Local token purge. "Everywhere" is the backend's DELETE /sessions, never called from here.
        runCatching { Amplify.Auth.signOut() }
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    private fun signUpOptions(email: String, given: String, family: String): AuthSignUpOptions =
        AuthSignUpOptions.builder()
            .userAttributes(
                listOf(
                    AuthUserAttribute(AuthUserAttributeKey.email(), email),
                    AuthUserAttribute(AuthUserAttributeKey.givenName(), given),
                    AuthUserAttribute(AuthUserAttributeKey.familyName(), family),
                ),
            )
            .build()

    private suspend fun autoSignIn(): AuthStep {
        val result = Amplify.Auth.autoSignIn()
        return if (result.isSignedIn) sessionOrFail() else AuthStep.Failed(AuthError.Unexpected)
    }

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
     *  import of every subtype. `UserNotFound` and `NotAuthorized` collapse to one value (FR-016). */
    private fun mapError(e: Throwable): AuthError = when (e::class.simpleName) {
        "UserNotFoundException", "NotAuthorizedException", "UserNotConfirmedException" -> AuthError.InvalidCredentials
        "CodeMismatchException" -> AuthError.CodeIncorrect
        "CodeExpiredException" -> AuthError.CodeExpired
        "LimitExceededException", "TooManyRequestsException", "TooManyFailedAttemptsException" -> AuthError.RateLimited()
        else -> AuthError.Unexpected
    }
}
