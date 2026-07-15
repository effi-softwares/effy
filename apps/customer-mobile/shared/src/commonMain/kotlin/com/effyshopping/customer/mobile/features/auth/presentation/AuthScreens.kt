package com.effyshopping.customer.mobile.features.auth.presentation

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.auth.AuthError
import com.effyshopping.customer.mobile.core.auth.AuthStep
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.nav.AppRoute
import com.effyshopping.customer.mobile.core.nav.OtpPurpose
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
 * On a terminal step it drives the [AppContainer.session] and navigates via [AppContainer.navigator].
 * Errors come from the closed [AuthError] set — `UserNotFound` and `NotAuthorized` are the SAME message
 * (FR-016), so the app is never an account-enumeration oracle.
 */
class AuthViewModel(private val container: AppContainer) : ViewModel() {
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
            container.authDriver.signUpWithPassword(email.trim(), password, given.trim(), family.trim())
        }
    }

    fun registerPasswordless(email: String, given: String, family: String) = run {
        pendingEmail = email.trim(); pendingSeedPassword = false
        drive(seedPassword = false) {
            container.authDriver.signUpPasswordless(email.trim(), given.trim(), family.trim())
        }
    }

    fun signInWithPassword(email: String, password: String, returnTo: AppRoute?) {
        pendingEmail = email.trim(); pendingReturnTo = returnTo
        drive(seedPassword = false) { container.authDriver.signInWithPassword(email.trim(), password) }
    }

    fun signInWithOtp(email: String, returnTo: AppRoute?) {
        pendingEmail = email.trim(); pendingReturnTo = returnTo
        drive(seedPassword = false) { container.authDriver.signInWithEmailOtp(email.trim()) }
    }

    fun submitOtp(route: AppRoute.VerifyOtp, code: String) {
        pendingReturnTo = route.returnTo
        when (route.purpose) {
            OtpPurpose.SIGN_IN -> drive(seedPassword = false) { container.authDriver.confirmOtp(code.trim()) }
            OtpPurpose.SIGN_UP -> drive(seedPassword = pendingSeedPassword) { container.authDriver.confirmSignUp(route.email, code.trim()) }
            OtpPurpose.RECOVERY -> {} // recovery uses its own screen (code + new password → backend)
        }
    }

    fun sendRecoveryCode(email: String) {
        pendingEmail = email.trim()
        launch {
            when (val step = container.authDriver.startPasswordReset(email.trim())) {
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
                container.customers.confirmPasswordReset(email.trim(), code.trim(), newPassword)
                _state.value = AuthUiState(info = "Password updated. Sign in with your new password.")
                container.navigator.resetTo(AppRoute.SignIn())
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
                    container.navigator.push(AppRoute.VerifyOtp(pendingEmail, OtpPurpose.SIGN_IN, pendingReturnTo))
                }
                is AuthStep.NeedsSignUpConfirmation -> {
                    _state.value = AuthUiState()
                    container.navigator.push(AppRoute.VerifyOtp(step.email, OtpPurpose.SIGN_UP, pendingReturnTo))
                }
                is AuthStep.Failed -> _state.value = AuthUiState(error = message(step.error))
            }
        }
    }

    private suspend fun completeSignIn(seedPassword: Boolean) {
        container.session.onSignedIn(seedPassword)
        val returnTo = pendingReturnTo
        container.navigator.resetTo(AppRoute.Home)
        if (returnTo != null && returnTo != AppRoute.Home) container.navigator.push(returnTo)
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
    val vm = viewModel { AuthViewModel(container) }
    LaunchedEffect(route) { vm.clearTransient() }
    when (route) {
        is AppRoute.SignIn -> SignInScreen(container, vm, route.returnTo)
        AppRoute.SignUp -> SignUpScreen(container, vm)
        is AppRoute.VerifyOtp -> VerifyOtpScreen(container, vm, route)
        AppRoute.Recovery -> RecoveryScreen(container, vm)
        else -> {}
    }
}

@Composable
private fun AuthScaffold(
    container: AppContainer,
    title: String,
    state: AuthUiState,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        content()
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        state.info?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (state.loading) CircularProgressIndicator(modifier = Modifier.padding(top = 8.dp))
        TextButton(onClick = { container.navigator.pop() }) { Text("Back") }
    }
}

@Composable
private fun SignInScreen(container: AppContainer, vm: AuthViewModel, returnTo: AppRoute?) {
    val state by vm.state.collectAsState()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    AuthScaffold(container, "Sign in", state) {
        EmailField(email) { email = it }
        PasswordField(password, "Password") { password = it }
        Button(onClick = { vm.signInWithPassword(email, password, returnTo) }, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
            Text("Sign in with password")
        }
        TextButton(onClick = { vm.signInWithOtp(email, returnTo) }, enabled = !state.loading) {
            Text("Email me a code instead")
        }
        TextButton(onClick = { container.navigator.push(AppRoute.SignUp) }) { Text("Create an account") }
        TextButton(onClick = { container.navigator.push(AppRoute.Recovery) }) { Text("Forgot password?") }
    }
}

@Composable
private fun SignUpScreen(container: AppContainer, vm: AuthViewModel) {
    val state by vm.state.collectAsState()
    var given by remember { mutableStateOf("") }
    var family by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    AuthScaffold(container, "Create your account", state) {
        OutlinedTextField(given, { given = it }, label = { Text("First name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(family, { family = it }, label = { Text("Last name") }, modifier = Modifier.fillMaxWidth())
        EmailField(email) { email = it }
        Button(onClick = { vm.registerPasswordless(email, given, family) }, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
            Text("Sign up with an emailed code")
        }
        Text("Or set a password (optional):", style = MaterialTheme.typography.bodyMedium)
        PasswordField(password, "Password (≥ $PASSWORD_MIN_LENGTH characters)") { password = it }
        Button(onClick = { vm.registerWithPassword(email, password, given, family) }, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
            Text("Sign up with a password")
        }
    }
}

@Composable
private fun VerifyOtpScreen(container: AppContainer, vm: AuthViewModel, route: AppRoute.VerifyOtp) {
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }
    AuthScaffold(container, "Enter the code", state) {
        Text("We emailed a code to ${route.email}.", style = MaterialTheme.typography.bodyMedium)
        CodeField(code) { code = it }
        Button(onClick = { vm.submitOtp(route, code) }, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
            Text("Continue")
        }
    }
}

@Composable
private fun RecoveryScreen(container: AppContainer, vm: AuthViewModel) {
    val state by vm.state.collectAsState()
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    AuthScaffold(container, "Reset your password", state) {
        EmailField(email) { email = it }
        TextButton(onClick = { vm.sendRecoveryCode(email) }, enabled = !state.loading) { Text("Send me a code") }
        CodeField(code) { code = it }
        PasswordField(newPassword, "New password (≥ $PASSWORD_MIN_LENGTH characters)") { newPassword = it }
        Button(onClick = { vm.confirmRecovery(email, code, newPassword) }, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
            Text("Reset password")
        }
    }
}

// ── shared field composables ───────────────────────────────────────────────────────────────────

@Composable
private fun EmailField(value: String, onChange: (String) -> Unit) = OutlinedTextField(
    value, onChange, label = { Text("Email") }, singleLine = true,
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
    modifier = Modifier.fillMaxWidth(),
)

/** No re-type-to-confirm, and paste is allowed by default (FR-023). */
@Composable
private fun PasswordField(value: String, label: String, onChange: (String) -> Unit) = OutlinedTextField(
    value, onChange, label = { Text(label) }, singleLine = true,
    visualTransformation = PasswordVisualTransformation(),
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
    modifier = Modifier.fillMaxWidth(),
)

@Composable
private fun CodeField(value: String, onChange: (String) -> Unit) = OutlinedTextField(
    value, onChange, label = { Text("Code") }, singleLine = true,
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
    modifier = Modifier.fillMaxWidth(),
)
