package com.effyshopping.customer.mobile.features.feedback.domain

/**
 * The feedback data port (Clean Architecture — domain depends on nothing).
 *
 * ⚠ `authenticated` selects the ROUTE, not a header: a signed-in shopper posts to the authed route
 * (linked to their record, trusted profile email); a guest posts to the public route with an
 * unverified email. The ViewModel decides from the session; the repository never trusts a body id.
 */
interface FeedbackRepository {
    suspend fun submit(draft: FeedbackDraft, authenticated: Boolean): SubmitFeedbackResult
}
