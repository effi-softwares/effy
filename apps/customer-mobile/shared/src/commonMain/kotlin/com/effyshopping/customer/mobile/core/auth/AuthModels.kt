package com.effyshopping.customer.mobile.core.auth

/**
 * A signed-in session with both tokens: the ID token is the gateway bearer, the access token is relayed
 * (`X-Effy-Access-Token`); `core/http/EffyHttpClient.kt`'s `authHeadersFor` decides which goes where. No
 * expiry: Amplify owns refresh and the app reads a fresh session per request. The tokens live in the SDK's
 * secure store; this is a transient read, never persisted.
 */
data class Session(
    val sub: String,
    val idToken: String,
    val accessToken: String,
)

/** The outcome of an auth step. The ViewModel drives the flow off this, never off SDK types. */
sealed interface AuthStep {
    /** Signed in. */
    data class Done(val session: Session) : AuthStep

    /** A code was emailed; confirm it with [AuthDriver.confirmOtp]. [destination] is masked for display. */
    data class NeedsOtp(val destination: String) : AuthStep

    /** Registration needs its emailed code confirmed with [AuthDriver.confirmSignUp]. */
    data class NeedsSignUpConfirmation(val email: String) : AuthStep

    data class Failed(val error: AuthError) : AuthStep
}

/**
 * A closed set of auth failures. The sdk's own exception text is never surfaced.
 *
 * [InvalidCredentials] intentionally covers both "wrong password" and "no such user". Distinguishing
 * them turns the app into an account-enumeration oracle; the pool sets
 * `prevent_user_existence_errors = ENABLED`, and the client must not undo that by leaking the
 * difference in a message.
 */
sealed interface AuthError {
    data object InvalidCredentials : AuthError
    data object CodeIncorrect : AuthError
    data object CodeExpired : AuthError

    /** Throttled. [retryAfterSeconds] is shown to the customer; the app explains the wait, never loops. */
    data class RateLimited(val retryAfterSeconds: Long? = null) : AuthError

    data object Network : AuthError
    data object Unavailable : AuthError
    data object Unexpected : AuthError
}
