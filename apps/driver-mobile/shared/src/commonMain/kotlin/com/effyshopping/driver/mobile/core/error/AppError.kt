package com.effyshopping.driver.mobile.core.error

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

    /**
     * 072 — the driver acted on a round before it opened. The platform refused and wrote nothing.
     * [opening] says when it will open, in the server's words; null only if the answer could not be
     * read, in which case the screen still says "not yet" rather than something generic.
     *
     * ⚠ DISTINCT FROM [Conflict] ON PURPOSE. Both are a 409, and [Conflict]'s message is "Someone
     * else just changed this. Pull to refresh" — which would send a driver pulling to refresh at a
     * round that is simply not open, for as long as they cared to try.
     */
    data class NotOpenYet(val opening: com.effyshopping.driver.mobile.core.opening.Opening?) : AppError

    /** Throttled. [retryAfterSeconds] is shown; explain the wait, never loop (FR-012). */
    data class RateLimited(val retryAfterSeconds: Long? = null) : AppError

    /** No network / backend unreachable — degraded + retry; lose nothing (FR-007). */
    data object Network : AppError

    data object Unavailable : AppError

    data object Unexpected : AppError
}

class AppException(val error: AppError) : Exception()

/**
 * True when the platform has given its final answer to a write — trying the same action again cannot
 * change it. A transient failure is not final: a retry keeps the same changeId (backlog C1).
 */
fun AppError.isFinal(): Boolean = when (this) {
    is AppError.Validation, AppError.Unauthenticated, AppError.Forbidden, AppError.NotFound, AppError.Conflict -> true
    is AppError.NotOpenYet, is AppError.RateLimited, AppError.Network, AppError.Unavailable, AppError.Unexpected -> false
}
