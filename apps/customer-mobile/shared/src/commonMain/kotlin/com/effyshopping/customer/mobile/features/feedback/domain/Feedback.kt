package com.effyshopping.customer.mobile.features.feedback.domain

/**
 * Customer feedback (046 US1) — the domain model for the mobile submission slice.
 *
 * ⚠ Categories, statuses and length bounds are the platform's, defined once server-side and in
 * `@effy/shared-types`; this enum is the mobile mirror. Its labels are what the shopper reads.
 */
enum class FeedbackCategory(val wire: String, val label: String) {
    BUG("bug", "Something's broken"),
    SUGGESTION("suggestion", "A suggestion"),
    COMPLAINT("complaint", "A complaint"),
    COMPLIMENT("compliment", "A compliment"),
    OTHER("other", "Something else"),
}

/** Where the submission came from (FR-011). Mobile submits `general` today; `checkout` is reserved. */
enum class FeedbackSource(val wire: String) { GENERAL("general"), CHECKOUT("checkout"), OTHER("other") }

/** Mirrors the shared FEEDBACK_MESSAGE_MAX — one bound, refused before storage. */
const val FEEDBACK_MESSAGE_MAX = 5000

/** A shopper's draft submission. `email`/`name` are honoured only for a guest (the authed route uses the profile). */
data class FeedbackDraft(
    val category: FeedbackCategory,
    val message: String,
    val rating: Int? = null,
    val name: String? = null,
    val email: String? = null,
    val source: FeedbackSource = FeedbackSource.GENERAL,
)

/** The outcome of a submit. Mirrors the server's uniform result (never leaks account existence). */
sealed interface SubmitFeedbackResult {
    data class Ok(val referenceCode: String) : SubmitFeedbackResult
    data class Invalid(val field: String? = null) : SubmitFeedbackResult
    data object RateLimited : SubmitFeedbackResult
    data object Error : SubmitFeedbackResult
}
