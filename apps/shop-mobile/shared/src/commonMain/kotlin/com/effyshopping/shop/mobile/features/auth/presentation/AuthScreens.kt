package com.effyshopping.shop.mobile.features.auth.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.auth.AuthError
import com.effyshopping.shop.mobile.core.auth.AuthStep
import com.effyshopping.shop.mobile.core.session.SessionManager
import com.effyshopping.shop.mobile.core.ui.AdaptiveContent
import com.effyshopping.shop.mobile.features.auth.domain.ConfirmSignIn
import com.effyshopping.shop.mobile.features.auth.domain.RequestSignInCode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The ONLY credential flow (014 US1): email → one-time code. No password field, no sign-up, no recovery
 * — the operators are admin-provisioned and passwordless (FR-008). Enumeration-safe: unknown user and
 * not-authorized produce the SAME message (FR-011).
 *
 * MVVM: the ViewModel takes its **explicit collaborators** (not the whole container) and owns the ENTIRE
 * UI state — including the field values — so the View is a pure function of [UiState].
 */
class AuthViewModel(
    private val requestSignInCode: RequestSignInCode,
    private val confirmSignIn: ConfirmSignIn,
    private val session: SessionManager,
) : ViewModel() {
    enum class Step { EMAIL, CODE }
    data class UiState(
        val step: Step = Step.EMAIL,
        val emailInput: String = "",
        val codeInput: String = "",
        val destination: String? = null,
        val loading: Boolean = false,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state = _state.asStateFlow()

    fun onEmailChange(value: String) { _state.value = _state.value.copy(emailInput = value, error = null) }
    fun onCodeChange(value: String) { _state.value = _state.value.copy(codeInput = value, error = null) }

    fun sendCode() = launch {
        when (val step = requestSignInCode(_state.value.emailInput)) {
            is AuthStep.NeedsOtp ->
                _state.value = _state.value.copy(step = Step.CODE, destination = step.destination, codeInput = "", error = null)
            is AuthStep.Done -> session.onSignedIn()          // already signed in (rare)
            is AuthStep.Failed -> _state.value = _state.value.copy(error = message(step.error))
        }
    }

    fun submitCode() = launch {
        when (val step = confirmSignIn(_state.value.codeInput)) {
            is AuthStep.Done -> session.onSignedIn()
            is AuthStep.Failed -> _state.value = _state.value.copy(error = message(step.error))
            is AuthStep.NeedsOtp -> _state.value = _state.value.copy(error = "That code isn't right.")
        }
    }

    fun backToEmail() { _state.value = _state.value.copy(step = Step.EMAIL, codeInput = "", destination = null, error = null) }

    private inline fun launch(crossinline block: suspend () -> Unit) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                block()
            } finally {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    private fun message(e: AuthError): String = when (e) {
        AuthError.InvalidCredentials -> "We couldn't sign you in. Check your email and try again."
        AuthError.CodeIncorrect -> "That code isn't right."
        AuthError.CodeExpired -> "That code has expired. Ask for a new one."
        is AuthError.RateLimited -> "Too many attempts. Please wait a little and try again."
        AuthError.Network -> "No connection. Check your network and try again."
        AuthError.Unavailable -> "We're having trouble right now. Try again shortly."
        AuthError.Unexpected -> "Something went wrong. Try again."
    }
}

@Composable
fun SignInFlow(container: AppContainer) {
    val vm = viewModel { AuthViewModel(container.requestSignInCode, container.confirmSignIn, container.session) }
    val state by vm.state.collectAsState()

    // Tablet-first (FR-003a): the sign-in is a bounded, centered card on a tablet — not a field stretched
    // across the whole landscape width — and fills the width on a compact phone window.
    AdaptiveContent(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Effy Shop", style = MaterialTheme.typography.headlineMedium)
        when (state.step) {
            AuthViewModel.Step.EMAIL -> {
                Text("Sign in with your work email — we'll send you a one-time code.", style = MaterialTheme.typography.bodyMedium)
                OutlinedTextField(
                    state.emailInput, vm::onEmailChange, label = { Text("Work email") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(onClick = vm::sendCode, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
                    Text("Send me a code")
                }
            }
            AuthViewModel.Step.CODE -> {
                Text("Enter the code we sent to ${state.destination ?: state.emailInput}.", style = MaterialTheme.typography.bodyMedium)
                OutlinedTextField(
                    state.codeInput, vm::onCodeChange, label = { Text("Code") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(onClick = vm::submitCode, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
                    Text("Sign in")
                }
                TextButton(onClick = vm::backToEmail) { Text("Use a different email") }
            }
        }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (state.loading) CircularProgressIndicator()
    }
}
