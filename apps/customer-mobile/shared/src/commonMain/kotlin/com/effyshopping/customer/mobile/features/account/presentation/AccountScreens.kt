package com.effyshopping.customer.mobile.features.account.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.nav.AppRoute
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.auth.presentation.PASSWORD_MIN_LENGTH
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AccountUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val maskedDestination: String? = null,
)

/**
 * Account management (013 US5). The security core: setting a FIRST password requires an emailed code,
 * verified by the BACKEND in the same request (FR-024); changing one requires the current password
 * (FR-025). Neither call touches Cognito directly — they go to `edge-api/customer`. A successful
 * password write revokes EVERY session including this device (FR-027), so the app returns to sign-in.
 */
class AccountViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(AccountUiState())
    val state = _state.asStateFlow()

    fun updateName(given: String, family: String) = run {
        launch {
            val updated = container.customers.updateName(given.trim().ifBlank { null }, family.trim().ifBlank { null })
            container.session.setAuthenticated(updated)
            container.navigator.pop() // back to Account; the greeting reads the record, so it's fresh
        }
    }

    /** Step 1 of set-password: email the step-up code (FR-024). Returns the masked destination. */
    fun sendSetPasswordCode() = launch {
        val masked = container.customers.requestPasswordChallenge()
        _state.value = _state.value.copy(maskedDestination = masked, info = "Enter the code we sent to $masked.")
    }

    /** Step 2: write the first password WITH the emailed code. Revokes all sessions → return to sign-in. */
    fun setPassword(code: String, newPassword: String) = run {
        if (!longEnough(newPassword)) return@run
        launch {
            container.customers.setPassword(code.trim(), newPassword)
            finishAfterPasswordWrite()
        }
    }

    /** Change an existing password; the current one is required (FR-025). Revokes all sessions. */
    fun changePassword(current: String, newPassword: String) = run {
        if (!longEnough(newPassword)) return@run
        launch {
            container.customers.changePassword(current, newPassword)
            finishAfterPasswordWrite()
        }
    }

    fun signOut() = launch {
        container.session.signOutLocally()
        container.navigator.resetTo(AppRoute.Home)
    }

    fun signOutEverywhere() = launch {
        runCatching { container.customers.signOutEverywhere() }
        container.session.signOutLocally()
        container.navigator.resetTo(AppRoute.Home)
    }

    private suspend fun finishAfterPasswordWrite() {
        // FR-027: the write revoked EVERY session, including this device. Back to sign-in with the news.
        container.session.signOutLocally()
        container.navigator.resetTo(AppRoute.SignIn())
    }

    private fun longEnough(pw: String): Boolean {
        if (pw.length < PASSWORD_MIN_LENGTH) {
            _state.value = _state.value.copy(error = "Use at least $PASSWORD_MIN_LENGTH characters.")
            return false
        }
        return true
    }

    private inline fun launch(crossinline block: suspend () -> Unit) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                block()
            } catch (e: AppException) {
                _state.value = _state.value.copy(error = message(e.error))
                if (e.error == AppError.Forbidden) container.session.setBarred()
            } finally {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    private fun message(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        AppError.WrongPassword -> "That password isn't right."
        AppError.WrongPasswordMode -> "Please reopen the password screen and try again."
        AppError.Forbidden -> "This account can't be used."
        is AppError.RateLimited -> "Too many attempts. Please wait a little and try again."
        AppError.Network -> "No connection. Check your network and try again."
        AppError.Unavailable -> "We're having trouble right now. Try again shortly."
        AppError.Unauthenticated -> "Please sign in again."
        AppError.Unexpected -> "Something went wrong. Try again."
    }
}

@Composable
fun AccountRoutes(container: AppContainer, route: AppRoute, session: SessionState) {
    val customer = (session as? SessionState.Authenticated)?.customer
    if (customer == null) {
        // Defensive: only a signed-in customer reaches here; if not, go home.
        container.navigator.resetTo(AppRoute.Home)
        return
    }
    val vm = remember { AccountViewModel(container) }
    when (route) {
        AppRoute.Account -> AccountScreen(container, vm, customer)
        AppRoute.EditName -> EditNameScreen(container, vm, customer)
        AppRoute.PasswordSet -> PasswordScreen(container, vm, setFirst = true)
        AppRoute.PasswordChange -> PasswordScreen(container, vm, setFirst = false)
        else -> {}
    }
}

@Composable
private fun AccountScreen(container: AppContainer, vm: AccountViewModel, customer: Customer) {
    val state by vm.state.collectAsState()
    val nav = container.navigator
    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        InitialsAvatar(customer.name.initials)
        Text(customer.name.display.ifBlank { "Your account" }, style = MaterialTheme.typography.titleLarge)
        Text(customer.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

        HorizontalDivider()
        Button(onClick = { nav.push(AppRoute.EditName) }, modifier = Modifier.fillMaxWidth()) { Text("Change name") }
        // FR-024/FR-025: offer EXACTLY the right journey, from the platform-owned hasPassword.
        if (customer.hasPassword) {
            Button(onClick = { nav.push(AppRoute.PasswordChange) }, modifier = Modifier.fillMaxWidth()) { Text("Change password") }
        } else {
            Button(onClick = { nav.push(AppRoute.PasswordSet) }, modifier = Modifier.fillMaxWidth()) { Text("Set a password") }
        }

        HorizontalDivider()
        TextButton(onClick = { vm.signOut() }) { Text("Sign out") }
        TextButton(onClick = { vm.signOutEverywhere() }) { Text("Sign out on all devices") }
        TextButton(onClick = { nav.pop() }) { Text("Back") }

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (state.loading) CircularProgressIndicator()
    }
}

@Composable
private fun EditNameScreen(container: AppContainer, vm: AccountViewModel, customer: Customer) {
    val state by vm.state.collectAsState()
    var given by remember { mutableStateOf(customer.name.given.orEmpty()) }
    var family by remember { mutableStateOf(customer.name.family.orEmpty()) }
    FormColumn {
        Text("Your name", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(given, { given = it }, label = { Text("First name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(family, { family = it }, label = { Text("Last name") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = { vm.updateName(given, family) }, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) { Text("Save") }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (state.loading) CircularProgressIndicator()
        TextButton(onClick = { container.navigator.pop() }) { Text("Back") }
    }
}

@Composable
private fun PasswordScreen(container: AppContainer, vm: AccountViewModel, setFirst: Boolean) {
    val state by vm.state.collectAsState()
    var current by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    FormColumn {
        Text(if (setFirst) "Set a password" else "Change your password", style = MaterialTheme.typography.headlineSmall)
        if (setFirst) {
            Text(
                "For your security, we'll email you a code to confirm it's you.",
                style = MaterialTheme.typography.bodyMedium,
            )
            TextButton(onClick = { vm.sendSetPasswordCode() }, enabled = !state.loading) { Text("Email me a code") }
            state.maskedDestination?.let {
                Password(code, "Code from your email", KeyboardType.Number) { code = it }
            }
        } else {
            Password(current, "Current password") { current = it }
        }
        Password(newPassword, "New password (≥ $PASSWORD_MIN_LENGTH characters)") { newPassword = it }
        Button(
            onClick = { if (setFirst) vm.setPassword(code, newPassword) else vm.changePassword(current, newPassword) },
            enabled = !state.loading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (setFirst) "Set password" else "Change password") }
        state.info?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (state.loading) CircularProgressIndicator()
        TextButton(onClick = { container.navigator.pop() }) { Text("Back") }
    }
}

@Composable
private fun InitialsAvatar(initials: String) {
    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(72.dp)) {
        Box(contentAlignment = Alignment.Center) {
            Text(initials, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onPrimary)
        }
    }
}

@Composable
private fun FormColumn(content: @Composable () -> Unit) = Column(
    modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
) { content() }

@Composable
private fun Password(
    value: String,
    label: String,
    keyboardType: KeyboardType = KeyboardType.Password,
    onChange: (String) -> Unit,
) = OutlinedTextField(
    value, onChange, label = { Text(label) }, singleLine = true,
    visualTransformation = PasswordVisualTransformation(),
    keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
    modifier = Modifier.fillMaxWidth(),
)
