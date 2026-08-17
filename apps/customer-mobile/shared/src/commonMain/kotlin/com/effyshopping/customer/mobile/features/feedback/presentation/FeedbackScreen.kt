package com.effyshopping.customer.mobile.features.feedback.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyChip
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackCategory
import com.effyshopping.customer.mobile.features.feedback.domain.SubmitFeedbackResult
import com.effyshopping.mobile.design.EffySpacing

/**
 * The feedback screen (046 US1). One immutable state, rendered; the View calls the ViewModel for
 * actions (MVVM). On success it swaps to a confirmation with the reference code; on failure the fields
 * are left intact so the shopper's words survive.
 */
@Composable
fun FeedbackScreen(viewModel: FeedbackViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Column(Modifier.fillMaxSize()) {
        EffyAppBar(title = "Give us feedback", onBack = onBack)

        when (val result = state.result) {
            is SubmitFeedbackResult.Ok -> FeedbackConfirmation(result.referenceCode)
            else -> FeedbackForm(state, viewModel)
        }
    }
}

@Composable
private fun FeedbackConfirmation(referenceCode: String) {
    EffyEmptyState(
        title = "Thanks — we've got it",
        body = "A real person will read what you sent. If it needs a reply, we'll email you back.\n\nYour reference: $referenceCode",
    )
}

@Composable
private fun FeedbackForm(state: FeedbackUiState, viewModel: FeedbackViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
    ) {
        EffyDisplay(text = "What's on your mind?")

        Text("What kind of feedback is this?", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            FeedbackCategory.entries.forEach { c ->
                EffyChip(label = c.label, selected = state.category == c, onClick = { viewModel.setCategory(c) })
            }
        }

        EffyField(
            label = "Your message",
            value = state.message,
            onValueChange = viewModel::setMessage,
            placeholder = "Tell us what's on your mind…",
            singleLine = false,
            error = if (state.result is SubmitFeedbackResult.Invalid && state.result.field == "message") "Please tell us a little about it." else null,
            modifier = Modifier.fillMaxWidth(),
        )

        Text("How would you rate your experience? (optional)", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            (1..5).forEach { n ->
                EffyChip(
                    label = n.toString(),
                    selected = state.rating == n,
                    onClick = { viewModel.setRating(if (state.rating == n) null else n) },
                )
            }
        }

        EffyField(
            label = if (state.signedIn) "Your name" else "Your name (optional)",
            value = state.name,
            onValueChange = viewModel::setName,
            placeholder = "Jamie",
            modifier = Modifier.fillMaxWidth(),
        )

        // ⚠ Signed-in shoppers don't see this — the authed route uses their verified profile email.
        if (!state.signedIn) {
            EffyField(
                label = "Your email (optional)",
                value = state.email,
                onValueChange = viewModel::setEmail,
                placeholder = "you@example.com",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                error = if (state.result is SubmitFeedbackResult.Invalid && state.result.field == null) null else null,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                "Leave it if you'd like a reply. We won't use it for anything else.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        val errorMessage = when (val r = state.result) {
            is SubmitFeedbackResult.Invalid -> "Please check the highlighted fields and try again."
            SubmitFeedbackResult.RateLimited -> "You've sent us a few messages just now — please wait a little before sending another."
            SubmitFeedbackResult.Error -> "We couldn't send that just now. Your message is still here — try again in a moment."
            is SubmitFeedbackResult.Ok, null -> null
        }
        if (errorMessage != null) {
            Text(errorMessage, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        }

        EffyPrimaryButton(
            label = "Send feedback",
            onClick = viewModel::submit,
            enabled = state.canSubmit,
            loading = state.submitting,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
