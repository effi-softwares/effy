package com.effyshopping.customer.mobile.core.error

/**
 * A CLOSED set of failures the UI can act on (013). Backend `application/problem+json` and transport
 * failures both map to one of these; the raw SDK/HTTP text is never surfaced.
 */
sealed interface AppError {
    /** The customer's own input was rejected (too short, breached password, bad/expired code). */
    data class Validation(val message: String, val fieldErrors: Map<String, String> = emptyMap()) : AppError

    /** Not signed in, the token pair mismatched, or the wrong current password. */
    data object Unauthenticated : AppError

    /** Wrong current password specifically — distinct from a lost session so the UI can say so. */
    data object WrongPassword : AppError

    /** Barred, or an account that cannot be used. A valid credential is not permission (FR-033). */
    data object Forbidden : AppError

    /** The wrong password journey was attempted (set on an account with one; change on one without). */
    data object WrongPasswordMode : AppError

    /** Throttled. [retryAfterSeconds] is shown; the app explains the wait, never loops (FR-017). */
    data class RateLimited(val retryAfterSeconds: Long? = null) : AppError

    /** No network / backend unreachable — recoverable; lose nothing the customer typed (FR-008). */
    data object Network : AppError

    /** The backend is up but failing. */
    data object Unavailable : AppError

    data object Unexpected : AppError
}

/** A thrown [AppError], for repository/service code that maps transport failures to the domain. */
class AppException(val error: AppError) : Exception()
