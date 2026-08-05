package com.effyshopping.customer.mobile.features.account.presentation

import com.effyshopping.mobile.kit.ui.OTP_LENGTH
import com.effyshopping.mobile.kit.ui.OtpInput
import com.effyshopping.mobile.kit.ui.OtpVariant
import com.effyshopping.mobile.kit.ui.isCompleteOtp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
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
import com.effyshopping.customer.mobile.core.presentation.EffyInlineLink
import com.effyshopping.customer.mobile.core.presentation.EffyPasswordField
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.features.account.domain.ChangePassword
import com.effyshopping.customer.mobile.features.auth.domain.ConfirmPasswordReset
import com.effyshopping.customer.mobile.features.account.domain.RequestPasswordChallenge
import com.effyshopping.customer.mobile.features.account.domain.SetPassword
import com.effyshopping.customer.mobile.core.auth.AuthError
import com.effyshopping.customer.mobile.core.auth.AuthStep
import com.effyshopping.customer.mobile.features.auth.domain.SignInWithPassword
import com.effyshopping.customer.mobile.features.auth.domain.StartPasswordReset
import com.effyshopping.customer.mobile.features.auth.presentation.PASSWORD_MIN_LENGTH
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.remember
import androidx.compose.ui.text.input.VisualTransformation
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_visibility
import com.effyshopping.customer.mobile.resources.ic_visibility_off
import org.jetbrains.compose.resources.painterResource

/**
 * The password journeys (034 — redesign of 026's single screen).
 *
 * There are two, and which one a shopper gets is decided ONLY by the platform-owned `hasPassword`,
 * never by how they signed in — a Google-linked customer is an ordinary native user and can hold a
 * password.
 *
 *   1. **Change** — they have one. Current · New · Confirm on a single screen, with a route out for
 *      "I've forgotten it".
 *   2. **Set** — they have none (they sign in with an emailed code). Three steps: explain, verify,
 *      choose.
 *
 * ⚠ NO STEPPER, NO PROGRESS DOTS. Each step asks for exactly one thing and its own heading says what
 * that thing is. A three-dot indicator on a three-screen flow is chrome describing chrome.
 *
 * ⚠⚠ THE WRITE STILL REVOKES EVERY SESSION — AND THIS DEVICE THEN SIGNS ITSELF BACK IN. ⚠⚠
 *
 * Read this before "simplifying" it, because the obvious simplification is a security regression.
 *
 * Cognito's revocation is ALL-OR-NOTHING: there is no "revoke every session except this one". The
 * backend therefore calls `globalSignOut` after the write (012 FR-024), and it must keep doing so —
 * that revocation IS the security control. The canonical reason a person changes their password is
 * "I think someone else has access", and a change that leaves the attacker's session alive does not
 * answer that at all.
 *
 * But the shopper on THIS device has just proven who they are twice over (a current password, or a
 * freshly emailed code) and has literally just typed the new password. So instead of stranding them
 * at a sign-in screen, this flow signs them straight back in with the credential they just chose.
 *
 * Net effect: every OTHER session dies, this one continues, and the shopper lands back on their
 * account. Both properties, no trade.
 *
 * ⚠ If the silent re-sign-in fails for any reason, the flow FAILS CLOSED — it signs out locally and
 * sends the shopper to sign in. It must never leave the app rendering an account behind a credential
 * the platform has already revoked.
 */

// ── The steps ─────────────────────────────────────────────────────────────────────────────────

private enum class CodeStep { INTRO, CODE, PASSWORD, DONE }

data class PasswordFlowUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val maskedDestination: String? = null,
    val done: Boolean = false,
    /** False when the silent re-sign-in failed and the shopper must sign in by hand. */
    val staySignedIn: Boolean = false,
)

class PasswordFlowViewModel(
    private val requestChallenge: RequestPasswordChallenge,
    private val setPasswordUseCase: SetPassword,
    private val changePasswordUseCase: ChangePassword,
    private val startResetUseCase: StartPasswordReset,
    private val confirmResetUseCase: ConfirmPasswordReset,
    private val signInWithPasswordUseCase: SignInWithPassword,
    private val session: SessionManager,
    private val navigator: CustomerNavigator,
) : ViewModel() {
    private val _state = MutableStateFlow(PasswordFlowUiState())
    val state = _state.asStateFlow()

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    /** Step-up code for SETTING a first password. */
    fun sendSetCode(onSent: () -> Unit) = launch {
        val masked = requestChallenge()
        _state.value = _state.value.copy(maskedDestination = masked)
        onSent()
    }

    /** Recovery code for RESETTING a forgotten one. The address is the account's — never typed. */
    fun sendResetCode(email: String, onSent: () -> Unit) = launch {
        when (val step = startResetUseCase(email)) {
            is AuthStep.NeedsOtp -> {
                _state.value = _state.value.copy(maskedDestination = mask(email))
                onSent()
            }
            is AuthStep.Failed -> _state.value = _state.value.copy(error = authMessage(step.error))
            else -> _state.value = _state.value.copy(error = "Something went wrong. Try again.")
        }
    }

    fun setPassword(email: String, code: String, newPassword: String) = launch {
        setPasswordUseCase(code.trim(), newPassword)
        finish(email, newPassword)
    }

    fun changePassword(email: String, current: String, newPassword: String) = launch {
        changePasswordUseCase(current, newPassword)
        finish(email, newPassword)
    }

    fun confirmReset(email: String, code: String, newPassword: String) = launch {
        confirmResetUseCase(email, code.trim(), newPassword)
        finish(email, newPassword)
    }

    /** Leave the success screen — back to the account the shopper came from. */
    fun leave() {
        if (_state.value.staySignedIn) navigator.pop() else {
            navigator.resetToRoot()
            navigator.push(CustomerNavKey.SignIn())
        }
    }

    /**
     * The write succeeded, so every session — including this one — has just been revoked.
     *
     * ⚠ Re-authenticate with the credential the shopper just chose, so THIS device continues while
     * every other one stays evicted. See the file header for why both halves matter.
     *
     * ⚠ FAILS CLOSED. If the re-sign-in does not come back `Done`, we sign out locally rather than
     * leave the app rendering an account behind a revoked credential.
     */
    private suspend fun finish(email: String, newPassword: String) {
        val step = runCatching { signInWithPasswordUseCase(email, newPassword) }.getOrNull()
        if (step is AuthStep.Done) {
            session.onSignedIn()
            _state.value = _state.value.copy(done = true, staySignedIn = true)
        } else {
            session.signOutLocally()
            _state.value = _state.value.copy(done = true, staySignedIn = false)
        }
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

    private fun mask(email: String): String {
        val at = email.indexOf('@')
        return if (at <= 0) email else "${email.first()}•••${email.substring(at)}"
    }

    /** The auth driver speaks its own error language; this screen shows one vocabulary either way. */
    private fun authMessage(e: AuthError): String = when (e) {
        AuthError.InvalidCredentials -> "That email or password isn't right."
        AuthError.CodeIncorrect -> "That code isn't right."
        // ⚠ 036 — names the control that actually exists. This flow's resend lives one step BACK, on
        // the "Email me a code" intro; "ask for a new one" pointed at nothing on this screen.
        AuthError.CodeExpired -> "That code has expired. Go back and ask for a new one."
        is AuthError.RateLimited -> "Too many attempts. Please wait a little and try again."
        AuthError.Network -> "No connection. Check your network and try again."
        AuthError.Unavailable -> "We're having trouble right now. Try again shortly."
        AuthError.Unexpected -> "Something went wrong. Try again."
    }

    private fun message(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        AppError.WrongPassword -> "That current password isn't right."
        AppError.WrongPasswordMode -> "Please reopen this screen and try again."
        is AppError.RateLimited -> "Too many attempts. Please wait a little and try again."
        AppError.Network -> "No connection. Check your network and try again."
        AppError.Forbidden -> "This account can't be used."
        AppError.Unauthenticated -> "Please sign in again."
        else -> "Something went wrong. Try again."
    }
}

// ── One layout for every password screen ──────────────────────────────────────────────────────

/**
 * Title, supporting line, fields — and the action pinned to the BOTTOM of the screen.
 *
 * ⚠ Bottom-anchored, not inline after the last field. These screens are short, so an inline button
 * floats in the middle of an otherwise empty page and its position shifts between steps as the field
 * count changes. A fixed bottom action sits in the thumb's reach and stays in the same place through
 * all three steps.
 */
@Composable
private fun PasswordStepScaffold(
    title: String,
    supporting: String,
    actionLabel: String,
    actionEnabled: Boolean,
    onAction: () -> Unit,
    onBack: () -> Unit,
    loading: Boolean,
    error: String?,
    content: @Composable ColumnScope.() -> Unit,
) {
    Scaffold(
        bottomBar = {
            Column(
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            ) {
                EffyPrimaryButton(actionLabel, onClick = onAction, enabled = actionEnabled && !loading)
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            EffyAppBar(title = title, onBack = onBack)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
            ) {
                Text(
                    supporting,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                content()
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (loading) CircularProgressIndicator()
            }
        }
    }
}

/** The account flows' password input — the shared one, so every field in the app matches. */
@Composable
private fun PasswordField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String? = null,
    error: String? = null,
) = EffyPasswordField(
    label = label,
    value = value,
    onValueChange = onValueChange,
    placeholder = placeholder,
    error = error,
)

/** The end of every journey. Back to the account when the session survived; to sign-in if not. */
@Composable
private fun PasswordDoneScreen(staySignedIn: Boolean, onContinue: () -> Unit) {
    val message = if (staySignedIn) {
        "Your password is updated. We signed out your other devices, so anyone else who was signed " +
            "in will need the new password."
    } else {
        "Your password is updated. For your security this signed you out everywhere — sign in with " +
            "your new password."
    }
    Scaffold(
        bottomBar = {
            Column(
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            ) {
                EffyPrimaryButton(
                    if (staySignedIn) "Back to account" else "Sign in",
                    onClick = onContinue,
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.xxxl),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Text("Password updated", style = MaterialTheme.typography.headlineSmall)
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ── 1. Change an existing password ────────────────────────────────────────────────────────────

@Composable
fun ChangePasswordScreen(container: AppContainer, email: String) {
    val vm = passwordFlowViewModel(container)
    val state by vm.state.collectAsState()

    var current by rememberSaveable { mutableStateOf("") }
    var next by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }

    if (state.done) {
        PasswordDoneScreen(staySignedIn = state.staySignedIn, onContinue = vm::leave)
        return
    }

    val tooShort = next.isNotEmpty() && next.length < PASSWORD_MIN_LENGTH
    val mismatch = confirm.isNotEmpty() && confirm != next

    PasswordStepScaffold(
        title = "Change password",
        supporting = "Choose a password of at least $PASSWORD_MIN_LENGTH characters. " +
            "Changing it signs you out on all your devices.",
        actionLabel = "Change password",
        actionEnabled = current.isNotEmpty() && next.length >= PASSWORD_MIN_LENGTH && confirm == next,
        onAction = { vm.changePassword(email, current, next) },
        onBack = { container.navigator.pop() },
        loading = state.loading,
        error = state.error,
    ) {
        PasswordField("Current password", current, { current = it; vm.clearError() })

        // ⚠ An inline link, not a button. It is a way OUT of this screen for someone who cannot
        // complete it — putting it on equal footing with the action would invite the wrong one.
        EffyInlineLink(
            prompt = "",
            action = "Forgot your current password?",
            onClick = { container.navigator.push(CustomerNavKey.PasswordReset) },
        )

        PasswordField(
            "New password",
            next,
            { next = it },
            placeholder = "At least $PASSWORD_MIN_LENGTH characters",
            error = if (tooShort) "Use at least $PASSWORD_MIN_LENGTH characters." else null,
        )
        PasswordField(
            "Confirm new password",
            confirm,
            { confirm = it },
            error = if (mismatch) "These passwords don't match." else null,
        )
    }
}

// ── 2. Set a first password (no password today) ───────────────────────────────────────────────

@Composable
fun SetPasswordScreen(container: AppContainer, email: String) {
    val vm = passwordFlowViewModel(container)
    val state by vm.state.collectAsState()

    var step by rememberSaveable { mutableStateOf(CodeStep.INTRO) }
    var code by rememberSaveable { mutableStateOf("") }
    var next by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }

    CodeDrivenPasswordFlow(
        container = container,
        vm = vm,
        state = state,
        step = step,
        onStep = { step = it },
        code = code,
        onCode = { code = it },
        next = next,
        onNext = { next = it },
        confirm = confirm,
        onConfirm = { confirm = it },
        title = "Set a password",
        introSupporting = "Your account doesn't have a password yet — you sign in with a code we " +
            "email you. Adding one gives you a second way to sign in. We'll email a code to $email " +
            "to confirm it's you.",
        finalActionLabel = "Set password",
        onSendCode = { vm.sendSetCode { step = CodeStep.CODE } },
        onSubmit = { vm.setPassword(email, code, next) },
    )
}

// ── 3. Reset a FORGOTTEN password, from inside the account ────────────────────────────────────

@Composable
fun ResetPasswordScreen(container: AppContainer, email: String) {
    val vm = passwordFlowViewModel(container)
    val state by vm.state.collectAsState()

    var step by rememberSaveable { mutableStateOf(CodeStep.INTRO) }
    var code by rememberSaveable { mutableStateOf("") }
    var next by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }

    CodeDrivenPasswordFlow(
        container = container,
        vm = vm,
        state = state,
        step = step,
        onStep = { step = it },
        code = code,
        onCode = { code = it },
        next = next,
        onNext = { next = it },
        confirm = confirm,
        onConfirm = { confirm = it },
        title = "Reset password",
        // ⚠ The address is NOT asked for. The platform knows it, and asking a signed-in shopper a
        // question it already has the answer to only creates a way to get it wrong.
        introSupporting = "We'll email a code to $email so you can choose a new password.",
        finalActionLabel = "Reset password",
        onSendCode = { vm.sendResetCode(email) { step = CodeStep.CODE } },
        onSubmit = { vm.confirmReset(email, code, next) },
    )
}

/**
 * The shared three-step shape: explain → verify → choose.
 *
 * Set-a-password and reset-a-password differ only in which endpoint issues the code and which one
 * accepts it; the shopper's journey is identical, so it is written once.
 */
@Composable
private fun CodeDrivenPasswordFlow(
    container: AppContainer,
    vm: PasswordFlowViewModel,
    state: PasswordFlowUiState,
    step: CodeStep,
    onStep: (CodeStep) -> Unit,
    code: String,
    onCode: (String) -> Unit,
    next: String,
    onNext: (String) -> Unit,
    confirm: String,
    onConfirm: (String) -> Unit,
    title: String,
    introSupporting: String,
    finalActionLabel: String,
    onSendCode: () -> Unit,
    onSubmit: () -> Unit,
) {
    if (state.done) {
        PasswordDoneScreen(staySignedIn = state.staySignedIn, onContinue = vm::leave)
        return
    }

    val back = {
        when (step) {
            CodeStep.INTRO -> container.navigator.pop()
            CodeStep.CODE -> onStep(CodeStep.INTRO)
            CodeStep.PASSWORD -> onStep(CodeStep.CODE)
            CodeStep.DONE -> Unit
        }
        vm.clearError()
    }

    when (step) {
        CodeStep.INTRO -> PasswordStepScaffold(
            title = title,
            supporting = introSupporting,
            actionLabel = "Email me a code",
            actionEnabled = true,
            onAction = onSendCode,
            onBack = back,
            loading = state.loading,
            error = state.error,
        ) {}

        CodeStep.CODE -> PasswordStepScaffold(
            title = title,
            supporting = "Enter the $OTP_LENGTH-digit code we sent to ${state.maskedDestination ?: "your email"}.",
            actionLabel = "Continue",
            // The code is not spent here — it travels with the new password in ONE request, so a
            // session that cannot produce it never reaches the write.
            // ⚠ `isCompleteOtp`, not `isNotBlank`: exactly six digits, so a longer paste leaves the
            // action inactive and VISIBLE rather than advancing with a reshaped value (FR-004/FR-005).
            actionEnabled = isCompleteOtp(code),
            onAction = { onStep(CodeStep.PASSWORD) },
            onBack = back,
            loading = state.loading,
            error = state.error,
        ) {
            // ⚠ 036 FR-001 — the SHARED code field, at last. This was a generic `EffyField`: no digit
            // filter, no length gate, and — the one that actually costs the customer something — no
            // `UITextContentTypeOneTimeCode`, so iOS never offered the code from Mail on a screen
            // reached precisely when someone is already locked out of their password.
            OtpInput(
                value = code,
                onValueChange = onCode,
                onSubmit = { if (isCompleteOtp(code)) onStep(CodeStep.PASSWORD) },
                enabled = !state.loading,
                variant = OtpVariant.Cells,
            )
        }

        CodeStep.PASSWORD -> {
            val tooShort = next.isNotEmpty() && next.length < PASSWORD_MIN_LENGTH
            val mismatch = confirm.isNotEmpty() && confirm != next
            PasswordStepScaffold(
                title = title,
                supporting = "Choose a password of at least $PASSWORD_MIN_LENGTH characters.",
                actionLabel = finalActionLabel,
                actionEnabled = next.length >= PASSWORD_MIN_LENGTH && confirm == next,
                onAction = onSubmit,
                onBack = back,
                loading = state.loading,
                error = state.error,
            ) {
                PasswordField(
                    "New password",
                    next,
                    onNext,
                    placeholder = "At least $PASSWORD_MIN_LENGTH characters",
                    error = if (tooShort) "Use at least $PASSWORD_MIN_LENGTH characters." else null,
                )
                PasswordField(
                    "Confirm new password",
                    confirm,
                    onConfirm,
                    error = if (mismatch) "These passwords don't match." else null,
                )
            }
        }

        CodeStep.DONE -> PasswordDoneScreen(staySignedIn = state.staySignedIn, onContinue = vm::leave)
    }
}

@Composable
private fun passwordFlowViewModel(container: AppContainer) = viewModel {
    PasswordFlowViewModel(
        container.requestPasswordChallenge,
        container.setPassword,
        container.changePassword,
        container.startPasswordReset,
        container.confirmPasswordReset,
        container.signInWithPassword,
        container.session,
        container.navigator,
    )
}
