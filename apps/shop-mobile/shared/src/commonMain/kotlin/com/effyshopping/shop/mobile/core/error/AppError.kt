package com.effyshopping.shop.mobile.core.error

/**
 * A CLOSED set of failures the UI can act on (014 FR-031). Backend `application/problem+json` and
 * transport failures both map to one of these; the raw SDK/HTTP text is never surfaced (no internal detail).
 */
sealed interface AppError {
    data class Validation(val message: String) : AppError

    /** Not signed in / token invalid → re-authenticate. */
    data object Unauthenticated : AppError

    /** A denial: the manager gate refused, or a disabled operator. Rendered uniformly (FR-025). */
    data object Forbidden : AppError

    /** Throttled. [retryAfterSeconds] is shown; explain the wait, never loop (FR-012). */
    data class RateLimited(val retryAfterSeconds: Long? = null) : AppError

    /** No network / backend unreachable — degraded + retry; lose nothing (FR-007). */
    data object Network : AppError

    data object Unavailable : AppError

    data object Unexpected : AppError
}

class AppException(val error: AppError) : Exception()
