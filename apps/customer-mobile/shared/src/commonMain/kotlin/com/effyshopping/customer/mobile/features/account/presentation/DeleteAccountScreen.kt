package com.effyshopping.customer.mobile.features.account.presentation

import com.effyshopping.mobile.kit.ui.OtpInput
import com.effyshopping.mobile.kit.ui.OtpVariant
import com.effyshopping.mobile.kit.ui.isCompleteOtp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.nav.CustomerNavigator
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.features.account.domain.CloseAccount
import com.effyshopping.customer.mobile.features.account.domain.ClosurePreview
import com.effyshopping.customer.mobile.features.account.domain.PreviewAccountClosure
import com.effyshopping.customer.mobile.features.account.domain.RequestClosureCode
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Account deletion (034 US3) — the mobile half.
 *
 * ⚠ THE WORD IS "DELETE", AND THERE IS NO ALTERNATIVE ON OFFER (FR-037/SC-009). No screen here says
 * deactivate, disable, freeze or pause, and no such state exists to reach. Both documented App Review
 * rejections in this area were deactivation flows with a support agent in the loop — the difference
 * between shipping and being rejected is that erasure runs automatically once requested.
 *
 * The flow is: read the preview → show what happens and what blocks it → email a code → confirm.
 */
data class DeleteAccountUiState(
    val loading: Boolean = true,
    val preview: ClosurePreview? = null,
    val maskedDestination: String? = null,
    val eraseAfterIso: String? = null,
    val error: String? = null,
)

class DeleteAccountViewModel(
    private val previewUseCase: PreviewAccountClosure,
    private val requestCodeUseCase: RequestClosureCode,
    private val closeUseCase: CloseAccount,
    private val session: SessionManager,
    private val navigator: CustomerNavigator,
) : ViewModel() {
    private val _state = MutableStateFlow(DeleteAccountUiState())
    val state = _state.asStateFlow()

    fun load() = launch {
        val preview = previewUseCase()
        _state.value = _state.value.copy(preview = preview)
        // ⚠ 034 FR-041a — this is the ONE place the client can learn that a closure is already live.
        // The backend's 403 is deliberately uniform and does not disclose whether an account is barred
        // or closing, so the session cannot infer it from a refusal. Promoting it here is what lets the
        // app root offer a way back instead of stranding the customer.
        if (preview.activeRequest != null) session.setClosing()
    }

    /** Step 1 — email the code. Refused server-side if a blocker appeared since the preview. */
    fun sendCode() = launch {
        val masked = requestCodeUseCase()
        _state.value = _state.value.copy(maskedDestination = masked)
    }

    /**
     * Step 2 — verify the code and close.
     *
     * ⚠ On success every session is dead, including this one, so the app returns to the signed-out
     * storefront. There is nothing to navigate back TO: the account this screen belonged to is gone.
     */
    fun confirm(code: String) = launch {
        val eraseAfter = closeUseCase(code)
        _state.value = _state.value.copy(eraseAfterIso = eraseAfter)
        // Every session is dead, including this one. Back to the signed-out storefront — there is
        // nothing to navigate back TO, because the account this screen belonged to is closed.
        session.signOutLocally()
        // ⚠ Home, not this tab's root — the Account tab has no guest page to return to, and a closed
        // account least of all. Both stacks are cleared: `resetToRoot()` acts on the active tab only.
        navigator.resetToRoot()
        navigator.selectTab(CustomerNavKey.Home)
        navigator.resetToRoot()
    }

    private inline fun launch(crossinline block: suspend () -> Unit) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                block()
            } catch (e: AppException) {
                _state.value = _state.value.copy(error = message(e.error))
            } finally {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    private fun message(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        is AppError.RateLimited -> "Too many attempts. Please wait a little and try again."
        AppError.Network -> "No connection. Check your network and try again."
        AppError.Forbidden -> "This account can't be used."
        AppError.Unauthenticated -> "Please sign in again."
        else -> "Something went wrong. Try again."
    }
}

@Composable
fun DeleteAccountScreen(container: AppContainer) {
    val vm = viewModel {
        DeleteAccountViewModel(
            container.previewAccountClosure,
            container.requestClosureCode,
            container.closeAccount,
            container.session,
            container.navigator,
        )
    }
    val state by vm.state.collectAsState()
    var code by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) { vm.load() }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Delete account", onBack = { container.navigator.pop() })

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            val preview = state.preview

            if (state.loading && preview == null) {
                CircularProgressIndicator()
                return@Column
            }

            if (preview == null) {
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                return@Column
            }

            // ── The blockers (FR-042) ─────────────────────────────────────────────────────────
            //
            // ⚠ Each names WHICH obligation, offers a route to it, and says WHEN IT CLEARS. A
            // refusal with no way forward is the dead end this requirement forbids, and it is what
            // Apple's "unnecessarily difficult" clause catches.
            if (preview.blockers.isNotEmpty()) {
                Text(
                    "You can't delete your account just yet",
                    style = MaterialTheme.typography.titleMedium,
                )
                preview.blockers.forEach { blocker ->
                    Text(blocker.sentence, style = MaterialTheme.typography.bodyMedium)
                    EffySecondaryButton(
                        label = "View order ${blocker.reference}",
                        onClick = {
                            container.navigator.push(CustomerNavKey.OrderDetail(blocker.orderId))
                        },
                    )
                    EffyHairline()
                }
                return@Column
            }

            // ── What deletion does (FR-040) ───────────────────────────────────────────────────
            Text("What happens when you delete", style = MaterialTheme.typography.titleMedium)
            Text(
                "Your account, your saved items, your addresses and your personal details are " +
                    "removed. This can't be undone after " +
                    preview.eraseAfterIfRequestedNowIso.take(10) + ".",
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(Modifier.height(EffySpacing.s))
            Text("What we keep, and why", style = MaterialTheme.typography.titleSmall)
            preview.retained.forEach {
                Text(
                    "• ${it.category} — ${it.reason}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(EffySpacing.md))
            EffyHairline()

            // ── Proof of control (FR-043) ─────────────────────────────────────────────────────
            //
            // ⚠ A valid session is NOT sufficient. The code goes to the account's verified email —
            // which is precisely why this works for a customer whose only credential is Google. A
            // password prompt here would be an unresolvable dead end for that entire cohort.
            if (state.maskedDestination == null) {
                Text(
                    "To continue, we'll email a code to make sure it's really you.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                EffyPrimaryButton(
                    label = "Email me a code",
                    onClick = { vm.sendCode() },
                    enabled = !state.loading,
                )
            } else {
                Text(
                    "Enter the code we sent to ${state.maskedDestination}.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                // ⚠ 036 FR-001 — the SHARED code field. It was a generic `EffyField` with no digit
                // filter and no autofill, on the single most consequential confirmation the platform
                // has: this code deletes an account.
                OtpInput(
                    value = code,
                    onValueChange = { code = it },
                    onSubmit = { if (isCompleteOtp(code)) vm.confirm(code) },
                    enabled = !state.loading,
                    variant = OtpVariant.Cells,
                )
                EffyPrimaryButton(
                    label = "Delete my account",
                    onClick = { vm.confirm(code) },
                    // ⚠ Exactly six digits — a wrong-length value is refused, not reshaped.
                    enabled = !state.loading && isCompleteOtp(code),
                )
            }

            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (state.loading) CircularProgressIndicator()
        }
    }
}
