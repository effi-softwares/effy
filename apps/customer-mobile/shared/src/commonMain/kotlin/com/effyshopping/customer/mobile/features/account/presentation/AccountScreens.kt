package com.effyshopping.customer.mobile.features.account.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.nav.CustomerNavigator
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.account.domain.ChangePassword
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.RequestPasswordChallenge
import com.effyshopping.customer.mobile.features.account.domain.SetPassword
import com.effyshopping.customer.mobile.features.account.domain.SignOutEverywhere
import com.effyshopping.customer.mobile.features.account.domain.UpdateName
import com.effyshopping.customer.mobile.features.auth.presentation.PASSWORD_MIN_LENGTH
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffyDetailRow
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyNavRow
import com.effyshopping.customer.mobile.features.help.presentation.CustomerServiceScreen
import com.effyshopping.customer.mobile.features.help.presentation.FaqsScreen
import com.effyshopping.customer.mobile.features.help.presentation.HelpCenterScreen
import com.effyshopping.customer.mobile.features.notifications.presentation.NotificationsScreen
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyPrimaryAction
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
class AccountViewModel(
    private val updateNameUseCase: UpdateName,
    private val requestPasswordChallengeUseCase: RequestPasswordChallenge,
    private val setPasswordUseCase: SetPassword,
    private val changePasswordUseCase: ChangePassword,
    private val signOutEverywhereUseCase: SignOutEverywhere,
    private val session: SessionManager,
    private val navigator: CustomerNavigator,
) : ViewModel() {
    private val _state = MutableStateFlow(AccountUiState())
    val state = _state.asStateFlow()

    fun updateName(given: String, family: String) = run {
        launch {
            // Send "" (not null) for a cleared field: the backend treats "" as a clear, but
            // `explicitNulls=false` would silently DROP a null, leaving the old value in place.
            val updated = updateNameUseCase(given, family)
            session.setAuthenticated(updated)
            navigator.pop() // back to Account; the greeting reads the record, so it's fresh
        }
    }

    /** Step 1 of set-password: email the step-up code (FR-024). Returns the masked destination. */
    fun sendSetPasswordCode() = launch {
        val masked = requestPasswordChallengeUseCase()
        _state.value = _state.value.copy(maskedDestination = masked, info = "Enter the code we sent to $masked.")
    }

    /** Step 2: write the first password WITH the emailed code. Revokes all sessions → return to sign-in. */
    fun setPassword(code: String, newPassword: String) = run {
        if (!longEnough(newPassword)) return@run
        launch {
            setPasswordUseCase(code, newPassword)
            finishAfterPasswordWrite()
        }
    }

    /** Change an existing password; the current one is required (FR-025). Revokes all sessions. */
    fun changePassword(current: String, newPassword: String) = run {
        if (!longEnough(newPassword)) return@run
        launch {
            changePasswordUseCase(current, newPassword)
            finishAfterPasswordWrite()
        }
    }

    fun signOut() = launch {
        session.signOutLocally()
        // The Account tab returns to ITS root, which for a guest is the sign-in landing. Resetting to
        // Home instead left the Account tab permanently rendering Discover.
        navigator.resetToRoot()
    }

    fun signOutEverywhere() = launch {
        runCatching { signOutEverywhereUseCase() }
        session.signOutLocally()
        navigator.resetToRoot()
    }

    /** Reset transient state (error/info/masked destination) so one sub-screen's error doesn't bleed
     *  onto another when navigating between Account / EditName / Password. */
    fun clearTransient() {
        _state.value = AccountUiState()
    }

    private suspend fun finishAfterPasswordWrite() {
        // FR-027: the write revoked EVERY session, including this device. Back to sign-in with the news.
        session.signOutLocally()
        // Back to the tab root (the guest landing), then into sign-in — so the arrow has somewhere
        // to go, rather than stranding the customer on a rootless sign-in screen.
        navigator.resetToRoot()
        navigator.push(CustomerNavKey.SignIn())
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
                if (e.error == AppError.Forbidden) session.setBarred()
            } finally {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    private fun message(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        AppError.WrongPassword -> "That password isn't right."
        AppError.WrongPasswordMode -> "Please reopen the password screen and try again."
        AppError.RequoteRequired -> "Prices updated. Please review and try again."
        AppError.DefaultDeleteBlocked -> "Set another address as your default first."
        AppError.Forbidden -> "This account can't be used."
        is AppError.RateLimited -> "Too many attempts. Please wait a little and try again."
        AppError.Network -> "No connection. Check your network and try again."
        AppError.NotFound -> "We couldn't find that."
        AppError.Unavailable -> "We're having trouble right now. Try again shortly."
        AppError.Unauthenticated -> "Please sign in again."
        AppError.Unexpected -> "Something went wrong. Try again."
    }
}

@Composable
fun AccountRoutes(container: AppContainer, route: CustomerNavKey, session: SessionState) {
    val customer = (session as? SessionState.Authenticated)?.customer
    if (customer == null) {
        // Defensive: only a signed-in customer reaches here; if not, fall back to the tab root,
        // which renders the guest landing.
        container.navigator.resetToRoot()
        return
    }
    val vm = viewModel {
        AccountViewModel(
            container.updateName, container.requestPasswordChallenge, container.setPassword,
            container.changePassword, container.signOutEverywhere, container.session, container.navigator,
        )
    }
    LaunchedEffect(route) { vm.clearTransient() } // fresh transient state on each sub-screen
    when (route) {
        CustomerNavKey.Account -> AccountScreen(container, vm, customer)
        CustomerNavKey.MyDetails -> EditNameScreen(container, vm, customer)
        // `setFirst` now travels ON the route rather than as two separate routes — a data class the
        // compiler checks, instead of two objects that had to be kept in step with the screen.
        is CustomerNavKey.Password -> PasswordScreen(container, vm, setFirst = route.setFirst)
        // 026 US4 — the new screens. Each is presentational and carries no session requirement of its
        // own; reaching them via Account is what already gates them.
        CustomerNavKey.Notifications -> NotificationsScreen()
        CustomerNavKey.Faqs -> FaqsScreen()
        CustomerNavKey.HelpCenter -> HelpCenterScreen()
        CustomerNavKey.CustomerService -> CustomerServiceScreen()
        else -> {}
    }
}

@Composable
private fun AccountScreen(container: AppContainer, vm: AccountViewModel, customer: Customer) {
    val state by vm.state.collectAsState()
    val nav = container.navigator
    // ⚠ 026 (T060): this WAS a centred column of full-width FILLED buttons — five of them, each
    // shouting as loudly as the next, which is the loudest thing in the old app. The source design
    // (and the constitution's "prefer lists and detail rows") uses quiet chevron rows with hairlines,
    // reserving a filled treatment for actions that commit something. Identity moves to the top as a
    // left-aligned header rather than a centred badge, so the screen reads as a settings list.
    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(EffySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            InitialsAvatar(customer.name.initials)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    customer.name.display.ifBlank { "Your account" },
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    customer.email,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        EffyNavRow("My details", onClick = { nav.push(CustomerNavKey.MyDetails) })
        // 022: manage saved delivery addresses.
        EffyNavRow("Address book", onClick = { nav.push(CustomerNavKey.AddressBook) })
        // The source kit reaches saved items from a bottom-bar tab; Effy's four tabs carry no Saved
        // tab, so it is reachable from the Discover header AND from here — this is where a signed-in
        // shopper looks for their own things, and one entry point for a whole screen is thin.
        EffyNavRow("Saved items", onClick = { nav.push(CustomerNavKey.Favorites) })
        // The source kit reaches saved items from a bottom-bar tab; Effy's five tabs are spoken for,
        // so it is reachable from the Discover header AND from here — this is where a signed-in
        // shopper looks for their own things, and one entry point for a whole screen is thin.
        // FR-024/FR-025: offer EXACTLY the right journey, from the platform-owned hasPassword.
        if (customer.hasPassword) {
            EffyNavRow("Change password", onClick = { nav.push(CustomerNavKey.Password(setFirst = false)) })
        } else {
            EffyNavRow("Set a password", onClick = { nav.push(CustomerNavKey.Password(setFirst = true)) })
        }

        Spacer(Modifier.height(EffySpacing.lg))

        // 026 US4 — the screens the source design has and this app did not.
        EffyNavRow("Notifications", onClick = { nav.push(CustomerNavKey.Notifications) })
        EffyNavRow("FAQs", onClick = { nav.push(CustomerNavKey.Faqs) })
        EffyNavRow("Help Center", onClick = { nav.push(CustomerNavKey.HelpCenter) })
        EffyNavRow("Customer Service", onClick = { nav.push(CustomerNavKey.CustomerService) })

        Spacer(Modifier.height(EffySpacing.lg))

        // Destructive, and said so in WORDS as well as colour — the error token alone would be a
        // lightness difference under the monochrome palette (FR-040).
        EffyNavRow("Sign out", onClick = { vm.signOut() }, destructive = true, showChevron = false)
        EffyNavRow(
            "Sign out on all devices",
            supporting = "Ends every session, including this one",
            onClick = { vm.signOutEverywhere() },
            destructive = true,
            showChevron = false,
        )

        state.error?.let {
            Text(
                it,
                modifier = Modifier.padding(horizontal = EffySpacing.lg),
                color = MaterialTheme.colorScheme.error,
            )
        }
        if (state.loading) {
            CircularProgressIndicator(modifier = Modifier.padding(horizontal = EffySpacing.lg))
        }
    }
}

@Composable
private fun EditNameScreen(container: AppContainer, vm: AccountViewModel, customer: Customer) {
    val state by vm.state.collectAsState()
    var given by remember { mutableStateOf(customer.name.given.orEmpty()) }
    var family by remember { mutableStateOf(customer.name.family.orEmpty()) }
    // 026: the source's "My Details" — an app bar, labelled fields, one filled action. The email is
    // shown as a read-only detail row because changing it is not a capability this app has; a
    // disabled-looking input would imply it might become one.
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "My Details", onBack = { container.navigator.pop() })
        FormColumn {
            EffyField("First name", given, { given = it }, placeholder = "Enter your first name")
            EffyField("Last name", family, { family = it }, placeholder = "Enter your last name")
            EffyDetailRow("Email", customer.email)
            EffyPrimaryButton(
                "Save",
                onClick = { vm.updateName(given, family) },
                enabled = !state.loading,
            )
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (state.loading) CircularProgressIndicator()
        }
    }
}

@Composable
private fun PasswordScreen(container: AppContainer, vm: AccountViewModel, setFirst: Boolean) {
    val state by vm.state.collectAsState()
    var current by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    // 026: the source's Reset Password layout — app bar, supporting line, labelled fields, one filled
    // action. The step-up code request is a SECONDARY button, not a text link: it is a real action
    // that sends an email, and a text link read as incidental next to the field it fills.
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(
            title = if (setFirst) "Set a password" else "Change password",
            onBack = { container.navigator.pop() },
        )
        FormColumn {
            if (setFirst) {
                Text(
                    "For your security, we’ll email you a code to confirm it’s you.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                EffySecondaryButton(
                    "Email me a code",
                    onClick = { vm.sendSetPasswordCode() },
                    enabled = !state.loading,
                )
                state.maskedDestination?.let {
                    EffyField(
                        "Code from your email",
                        code,
                        { code = it },
                        placeholder = "6-digit code",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
            } else {
                EffyField(
                    "Current password",
                    current,
                    { current = it },
                    placeholder = "Enter your current password",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    visualTransformation = PasswordVisualTransformation(),
                )
            }
            EffyField(
                "New password",
                newPassword,
                { newPassword = it },
                placeholder = "At least $PASSWORD_MIN_LENGTH characters",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                visualTransformation = PasswordVisualTransformation(),
            )
            EffyPrimaryButton(
                if (setFirst) "Set password" else "Change password",
                onClick = {
                    if (setFirst) vm.setPassword(code, newPassword) else vm.changePassword(current, newPassword)
                },
                enabled = !state.loading,
            )
            state.info?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (state.loading) CircularProgressIndicator()
        }
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
    verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
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
