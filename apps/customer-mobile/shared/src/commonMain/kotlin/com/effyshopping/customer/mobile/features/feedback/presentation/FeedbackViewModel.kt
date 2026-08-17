package com.effyshopping.customer.mobile.features.feedback.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackCategory
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackDraft
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackSource
import com.effyshopping.customer.mobile.features.feedback.domain.SubmitFeedback
import com.effyshopping.customer.mobile.features.feedback.domain.SubmitFeedbackResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The feedback form's UI state — one immutable observable object (Principle VI's MVVM rule). The View
 * renders it and calls the functions below; state flows down, events flow up.
 *
 * ⚠ `signedIn` is read at SUBMIT time via the injected lambda, not cached at construction — a sign-in
 * between opening the screen and sending is respected. A signed-in shopper's email field is hidden
 * (the authed route uses the verified profile email); a guest gets an optional email.
 */
data class FeedbackUiState(
    val category: FeedbackCategory? = null,
    val message: String = "",
    val rating: Int? = null,
    val name: String = "",
    val email: String = "",
    val signedIn: Boolean = false,
    val submitting: Boolean = false,
    val result: SubmitFeedbackResult? = null,
) {
    val canSubmit: Boolean get() = category != null && message.trim().isNotEmpty() && !submitting
}

class FeedbackViewModel(
    private val submitFeedback: SubmitFeedback,
    private val isSignedIn: () -> Boolean,
) : ViewModel() {

    private val _state = MutableStateFlow(FeedbackUiState(signedIn = isSignedIn()))
    val state: StateFlow<FeedbackUiState> = _state.asStateFlow()

    fun setCategory(c: FeedbackCategory) { _state.value = _state.value.copy(category = c, result = null) }
    fun setMessage(m: String) { _state.value = _state.value.copy(message = m, result = null) }
    fun setRating(r: Int?) { _state.value = _state.value.copy(rating = r) }
    fun setName(n: String) { _state.value = _state.value.copy(name = n) }
    fun setEmail(e: String) { _state.value = _state.value.copy(email = e, result = null) }

    fun submit() {
        val s = _state.value
        val category = s.category ?: return
        if (!s.canSubmit) return

        val authenticated = isSignedIn()
        _state.value = s.copy(submitting = true, signedIn = authenticated, result = null)

        viewModelScope.launch {
            val draft = FeedbackDraft(
                category = category,
                message = s.message,
                rating = s.rating,
                name = s.name.takeIf { it.isNotBlank() },
                email = if (authenticated) null else s.email.takeIf { it.isNotBlank() },
                source = FeedbackSource.GENERAL,
            )
            val result = submitFeedback(draft, authenticated)
            // ⚠ On failure the fields are LEFT INTACT so the shopper's words survive (the web FR-033 analog).
            _state.value = _state.value.copy(submitting = false, result = result)
        }
    }
}
