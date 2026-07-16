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

    /** The resource is gone / not this shop's (404). Detail screens turn this into a "no longer available". */
    data object NotFound : AppError

    /**
     * A 409 conflict: a stale `expectedUpdatedAt` on a focused edit (concurrent-edit signal, FR-023a — the
     * UI prompts a reload rather than silently overwriting), a duplicate SKU on create, or a hard-delete
     * guard ("archive instead", R8). Distinct from [Validation] so the UI can react specifically.
     */
    data object Conflict : AppError

    /** Throttled. [retryAfterSeconds] is shown; explain the wait, never loop (FR-012). */
    data class RateLimited(val retryAfterSeconds: Long? = null) : AppError

    /** No network / backend unreachable — degraded + retry; lose nothing (FR-007). */
    data object Network : AppError

    data object Unavailable : AppError

    data object Unexpected : AppError
}

class AppException(val error: AppError) : Exception()
