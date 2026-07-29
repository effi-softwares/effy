package com.effyshopping.customer.mobile.features.auth.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.auth.AuthError
import com.effyshopping.customer.mobile.core.auth.AuthStep
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.nav.AppNavigator
import com.effyshopping.customer.mobile.core.nav.AppRoute
import com.effyshopping.customer.mobile.core.nav.OtpPurpose
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.features.auth.domain.ConfirmOtp
import com.effyshopping.customer.mobile.features.auth.domain.ConfirmPasswordReset
import com.effyshopping.customer.mobile.features.auth.domain.ConfirmSignUp
import com.effyshopping.customer.mobile.features.auth.domain.RegisterPasswordless
import com.effyshopping.customer.mobile.features.auth.domain.RegisterWithPassword
import com.effyshopping.customer.mobile.features.auth.domain.SignInWithEmailOtp
import com.effyshopping.customer.mobile.features.auth.domain.SignInWithPassword
import com.effyshopping.customer.mobile.features.auth.domain.StartPasswordReset
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffyInlineLink
import com.effyshopping.customer.mobile.core.presentation.EffyOrDivider
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

const val PASSWORD_MIN_LENGTH = 12 // mirrors the platform policy (shared-types PASSWORD_MIN_LENGTH)

data class AuthUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
)

/**
 * The auth flow (013 US2). Registration (two routes), sign-in (two routes), OTP confirm, recovery.
 * On a terminal step it drives the [session] and navigates via [navigator]. Errors come from the closed
 * [AuthError] set — `UserNotFound` and `NotAuthorized` are the SAME message (FR-016), so the app is never
 * an account-enumeration oracle.
 *
 * Dependencies are **explicit collaborators**, not the whole container (service-locator seam removed).
 */
class AuthViewModel(
    private val registerWithPasswordUseCase: RegisterWithPassword,
    private val registerPasswordlessUseCase: RegisterPasswordless,
    private val confirmSignUpUseCase: ConfirmSignUp,
    private val signInWithPasswordUseCase: SignInWithPassword,
    private val signInWithEmailOtpUseCase: SignInWithEmailOtp,
    private val confirmOtpUseCase: ConfirmOtp,
    private val startPasswordResetUseCase: StartPasswordReset,
    private val confirmPasswordResetUseCase: ConfirmPasswordReset,
    private val session: SessionManager,
    private val navigator: AppNavigator,
) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state = _state.asStateFlow()

    fun clearError() { _state.value = _state.value.copy(error = null) }

    /** Reset the visible error/info when entering a new step; the pending flow state (email, seed,
     *  returnTo) lives outside UiState and deliberately survives across the sign-in steps. */
    fun clearTransient() { _state.value = AuthUiState() }

    fun registerWithPassword(email: String, password: String, given: String, family: String) = run {
        if (!passwordLongEnough(password)) return@run
        pendingEmail = email.trim(); pendingSeedPassword = true
        drive(seedPassword = true) {
            registerWithPasswordUseCase(email, password, given, family)
        }
    }

    fun registerPasswordless(email: String, given: String, family: String) = run {
        pendingEmail = email.trim(); pendingSeedPassword = false
        drive(seedPassword = false) {
            registerPasswordlessUseCase(email, given, family)
        }
    }

    fun signInWithPassword(email: String, password: String, returnTo: AppRoute?) {
        pendingEmail = email.trim(); pendingReturnTo = returnTo
        drive(seedPassword = false) { signInWithPasswordUseCase(email, password) }
    }

    fun signInWithOtp(email: String, returnTo: AppRoute?) {
        pendingEmail = email.trim(); pendingReturnTo = returnTo
        drive(seedPassword = false) { signInWithEmailOtpUseCase(email) }
    }

    fun submitOtp(route: AppRoute.VerifyOtp, code: String) {
        pendingReturnTo = route.returnTo
        when (route.purpose) {
            OtpPurpose.SIGN_IN -> drive(seedPassword = false) { confirmOtpUseCase(code) }
            OtpPurpose.SIGN_UP -> drive(seedPassword = pendingSeedPassword) { confirmSignUpUseCase(route.email, code) }
            OtpPurpose.RECOVERY -> {} // recovery uses its own screen (code + new password → backend)
        }
    }

    fun sendRecoveryCode(email: String) {
        pendingEmail = email.trim()
        launch {
            when (val step = startPasswordResetUseCase(email)) {
                is AuthStep.NeedsOtp -> _state.value = AuthUiState(info = "Enter the code we emailed and choose a new password.")
                is AuthStep.Failed -> _state.value = AuthUiState(error = message(step.error))
                else -> _state.value = AuthUiState(error = "Something went wrong. Try again.")
            }
        }
    }

    fun confirmRecovery(email: String, code: String, newPassword: String) {
        if (!passwordLongEnough(newPassword)) return
        launch {
            try {
                confirmPasswordResetUseCase(email, code, newPassword)
                _state.value = AuthUiState(info = "Password updated. Sign in with your new password.")
                navigator.resetTo(AppRoute.SignIn())
            } catch (e: AppException) {
                _state.value = AuthUiState(error = messageForApp(e))
            }
        }
    }

    // ── plumbing ─────────────────────────────────────────────────────────────────────────────────

    private var pendingEmail: String = ""
    private var pendingSeedPassword: Boolean = false
    private var pendingReturnTo: AppRoute? = null

    private fun passwordLongEnough(pw: String): Boolean {
        if (pw.length < PASSWORD_MIN_LENGTH) {
            _state.value = _state.value.copy(error = "Use at least $PASSWORD_MIN_LENGTH characters.")
            return false
        }
        return true
    }

    private fun drive(seedPassword: Boolean, block: suspend () -> AuthStep) {
        launch {
            when (val step = block()) {
                is AuthStep.Done -> completeSignIn(seedPassword)
                is AuthStep.NeedsOtp -> {
                    _state.value = AuthUiState()
                    navigator.push(AppRoute.VerifyOtp(pendingEmail, OtpPurpose.SIGN_IN, pendingReturnTo))
                }
                is AuthStep.NeedsSignUpConfirmation -> {
                    _state.value = AuthUiState()
                    navigator.push(AppRoute.VerifyOtp(step.email, OtpPurpose.SIGN_UP, pendingReturnTo))
                }
                is AuthStep.Failed -> _state.value = AuthUiState(error = message(step.error))
            }
        }
    }

    private suspend fun completeSignIn(seedPassword: Boolean) {
        session.onSignedIn(seedPassword)
        val returnTo = pendingReturnTo
        navigator.resetTo(AppRoute.Home)
        if (returnTo != null && returnTo != AppRoute.Home) navigator.push(returnTo)
    }

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
        AuthError.InvalidCredentials -> "That email or password isn't right."
        AuthError.CodeIncorrect -> "That code isn't right."
        AuthError.CodeExpired -> "That code has expired. Ask for a new one."
        is AuthError.RateLimited -> "Too many attempts. Please wait a little and try again."
        AuthError.Network -> "No connection. Check your network and try again."
        AuthError.Unavailable -> "We're having trouble right now. Try again shortly."
        AuthError.Unexpected -> "Something went wrong. Try again."
    }

    private fun messageForApp(e: AppException): String = when (e.error) {
        is com.effyshopping.customer.mobile.core.error.AppError.Validation ->
            (e.error as com.effyshopping.customer.mobile.core.error.AppError.Validation).message
        else -> "Something went wrong. Try again."
    }
}

// ── Screens ──────────────────────────────────────────────────────────────────────────────────────

@Composable
fun AuthRoutes(container: AppContainer, route: AppRoute) {
    val vm = viewModel {
        AuthViewModel(
            container.registerWithPassword, container.registerPasswordless, container.confirmSignUp,
            container.signInWithPassword, container.signInWithEmailOtp, container.confirmOtp,
            container.startPasswordReset, container.confirmPasswordReset, container.session, container.navigator,
        )
    }
    LaunchedEffect(route) { vm.clearTransient() }
    when (route) {
        is AppRoute.SignIn -> SignInScreen(container, vm, route.returnTo)
        AppRoute.SignUp -> SignUpScreen(container, vm)
        is AppRoute.VerifyOtp -> VerifyOtpScreen(container, vm, route)
        AppRoute.Recovery -> RecoveryScreen(container, vm)
        else -> {}
    }
}

/**
 * The source design's auth layout (026 T061, FR-025a — REPLACED, not restyled).
 *
 * Its shape, top to bottom: an H2 title, a grey supporting line, the fields, the primary action,
 * an "Or" separator, the federated route, and a bottom-anchored link to the opposite journey.
 *
 * ⚠ The old scaffold ended in a stack of four `TextButton`s — "Email me a code instead", "Create an
 * account", "Forgot password?", "Back" — which gave four identical-weight actions and no hierarchy.
 * The source distinguishes them: one filled CTA, one bordered alternative, inline underlined links
 * for the rest, and the opposite journey pinned to the bottom.
 */
@Composable
private fun AuthScaffold(
    container: AppContainer,
    title: String,
    subtitle: String,
    state: AuthUiState,
    footer: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(EffySurface.page)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
    ) {
        EffyDisplay(title, size = DisplaySize.Page)
        Text(
            subtitle,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        content()
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        state.info?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (state.loading) CircularProgressIndicator()
        if (footer != null) {
            Spacer(Modifier.height(EffySpacing.xl))
            footer()
        }
    }
}

@Composable
private fun SignInScreen(container: AppContainer, vm: AuthViewModel, returnTo: AppRoute?) {
    val state by vm.state.collectAsState()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var reveal by remember { mutableStateOf(false) }

    AuthScaffold(
        container,
        title = "Login to your account",
        subtitle = "It’s great to see you again.",
        state = state,
        footer = {
            EffyInlineLink("Don’t have an account?", "Join", onClick = {
                container.navigator.push(AppRoute.SignUp)
            })
        },
    ) {
        EffyField(
            "Email",
            email,
            { email = it },
            placeholder = "Enter your email address",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        EffyField(
            "Password",
            password,
            { password = it },
            placeholder = "Enter your password",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            visualTransformation = if (reveal) VisualTransformation.None else PasswordVisualTransformation(),
            trailing = {
                // The source's eye toggle. A label is supplied so the control is announced.
                TextButton(onClick = { reveal = !reveal }) {
                    Text(if (reveal) "Hide" else "Show", style = MaterialTheme.typography.bodyMedium)
                }
            },
        )
        EffyInlineLink("Forgot your password?", "Reset your password", onClick = {
            container.navigator.push(AppRoute.Recovery)
        })
        EffyPrimaryButton(
            "Login",
            onClick = { vm.signInWithPassword(email, password, returnTo) },
            enabled = !state.loading && email.isNotBlank() && password.isNotBlank(),
        )
        EffyOrDivider()
        // ⚠ The source offers Google AND Facebook here. Facebook is DROPPED (FR-030a): it is not an
        // Effy credential route, and rendering a sign-in button that cannot sign anyone in is worse
        // than omitting it. Email OTP takes its place — a route Effy does have and the source lacks.
        EffySecondaryButton(
            "Email me a code instead",
            onClick = { vm.signInWithOtp(email, returnTo) },
            enabled = !state.loading && email.isNotBlank(),
        )
    }
}

@Composable
private fun SignUpScreen(container: AppContainer, vm: AuthViewModel) {
    val state by vm.state.collectAsState()
    var given by remember { mutableStateOf("") }
    var family by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var reveal by remember { mutableStateOf(false) }
    AuthScaffold(
        container,
        title = "Create your account",
        subtitle = "A few details and you’re shopping.",
        state = state,
        footer = {
            EffyInlineLink("Already have an account?", "Login", onClick = {
                container.navigator.push(AppRoute.SignIn())
            })
        },
    ) {
        EffyField("First name", given, { given = it }, placeholder = "Enter your first name")
        EffyField("Last name", family, { family = it }, placeholder = "Enter your last name")
        EffyField(
            "Email",
            email,
            { email = it },
            placeholder = "Enter your email address",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        // ⚠ A password is OPTIONAL on this platform — the customer audience may register passwordless
        // (constitution Principle IV). The source has only a password form, so the passwordless route
        // is offered as the SECONDARY action rather than dropped.
        EffyField(
            "Password",
            password,
            { password = it },
            placeholder = "At least $PASSWORD_MIN_LENGTH characters — optional",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            visualTransformation = if (reveal) VisualTransformation.None else PasswordVisualTransformation(),
            trailing = {
                TextButton(onClick = { reveal = !reveal }) {
                    Text(if (reveal) "Hide" else "Show", style = MaterialTheme.typography.bodyMedium)
                }
            },
        )
        EffyPrimaryButton(
            "Create account",
            onClick = { vm.registerWithPassword(email, password, given, family) },
            enabled = !state.loading && email.isNotBlank() && password.isNotBlank(),
        )
        EffyOrDivider()
        EffySecondaryButton(
            "Sign up with an emailed code",
            onClick = { vm.registerPasswordless(email, given, family) },
            enabled = !state.loading && email.isNotBlank(),
        )
    }
}

@Composable
private fun VerifyOtpScreen(container: AppContainer, vm: AuthViewModel, route: AppRoute.VerifyOtp) {
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }
    AuthScaffold(container, "Enter the code", "Check your inbox — the code expires shortly.", state) {
        EffyField(
            "Code",
            code,
            { code = it },
            placeholder = "6-digit code",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        EffyPrimaryButton(
            "Continue",
            onClick = { vm.submitOtp(route, code) },
            enabled = !state.loading && code.isNotBlank(),
        )
    }
}

@Composable
private fun RecoveryScreen(container: AppContainer, vm: AuthViewModel) {
    val state by vm.state.collectAsState()
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    AuthScaffold(container, "Reset your password", "We’ll email you a code to set a new one.", state) {
        EffyField(
            "Email",
            email,
            { email = it },
            placeholder = "Enter your email address",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        EffySecondaryButton(
            "Send me a code",
            onClick = { vm.sendRecoveryCode(email) },
            enabled = !state.loading && email.isNotBlank(),
        )
        EffyField(
            "Code",
            code,
            { code = it },
            placeholder = "6-digit code",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        EffyField(
            "New password",
            newPassword,
            { newPassword = it },
            placeholder = "At least $PASSWORD_MIN_LENGTH characters",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            visualTransformation = PasswordVisualTransformation(),
        )
        EffyPrimaryButton(
            "Reset password",
            onClick = { vm.confirmRecovery(email, code, newPassword) },
            enabled = !state.loading,
        )
    }
}

