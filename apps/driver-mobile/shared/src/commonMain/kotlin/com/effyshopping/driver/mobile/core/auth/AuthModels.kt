package com.effyshopping.driver.mobile.core.auth

/**
 * A signed-in shop session (014 D2s). Carries the **access token** (the single bearer for `/shop/v1`)
 * and the **ID token** (used only client-side for the display email - never sent to the backend). No
 * expiry field: Amplify owns refresh. Tokens live in the sdk's secure store; this is a transient read.
 */
data class Session(
    val sub: String,
    val accessToken: String,
    val idToken: String,
)

/**
 * The outcome of an auth step. [NeedsOtp] means "a code was emailed, ask for it". Each driver names every
 * step it accepts (an unhandled one falls to `Failed(Unexpected)`), and `AuthStepMappingTest` pins the ones
 * that must never appear.
 */
sealed interface AuthStep {
    data class Done(val session: Session) : AuthStep
    data class NeedsOtp(val destination: String) : AuthStep   // a code was emailed → confirm it
    data class Failed(val error: AuthError) : AuthStep
}

/**
 * A closed set of auth failures. The sdk's exception text is never surfaced.
 *
 * [InvalidCredentials] covers both "unknown user" and "not authorized" - the message must never
 * reveal whether the email is a provisioned operator; the pool sets
 * `prevent_user_existence_errors = ENABLED`, and the client must not undo that.
 */
sealed interface AuthError {
    data object InvalidCredentials : AuthError
    data object CodeIncorrect : AuthError
    data object CodeExpired : AuthError
    data class RateLimited(val retryAfterSeconds: Long? = null) : AuthError
    data object Network : AuthError
    data object Unavailable : AuthError
    data object Unexpected : AuthError
}
