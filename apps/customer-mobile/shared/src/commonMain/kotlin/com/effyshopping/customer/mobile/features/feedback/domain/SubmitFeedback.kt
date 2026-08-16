package com.effyshopping.customer.mobile.features.feedback.domain

/**
 * Submit feedback (046 US1) — the use case the ViewModel depends on. Validation the UI already does is
 * re-affirmed here so the domain, not the screen, owns the rule (the message must be non-empty and
 * within bounds).
 */
class SubmitFeedback(private val repository: FeedbackRepository) {
    suspend operator fun invoke(draft: FeedbackDraft, authenticated: Boolean): SubmitFeedbackResult {
        val message = draft.message.trim()
        if (message.isEmpty() || message.length > FEEDBACK_MESSAGE_MAX) {
            return SubmitFeedbackResult.Invalid("message")
        }
        return repository.submit(draft.copy(message = message), authenticated)
    }
}
