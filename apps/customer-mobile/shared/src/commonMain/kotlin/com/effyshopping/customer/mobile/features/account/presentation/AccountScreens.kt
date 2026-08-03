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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffyValueRow
import androidx.compose.foundation.clickable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.ui.draw.rotate
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.customer.mobile.resources.ic_favorite_outlined
import com.effyshopping.customer.mobile.resources.ic_notifications_outlined
import com.effyshopping.customer.mobile.resources.ic_orders_outlined
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

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
    private val requestPasswordChallengeUseCase: RequestPasswordChallenge,
    private val setPasswordUseCase: SetPassword,
    private val changePasswordUseCase: ChangePassword,
    private val signOutEverywhereUseCase: SignOutEverywhere,
    private val session: SessionManager,
    private val navigator: CustomerNavigator,
) : ViewModel() {
    private val _state = MutableStateFlow(AccountUiState())
    val state = _state.asStateFlow()

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
            container.requestPasswordChallenge, container.setPassword,
            container.changePassword, container.signOutEverywhere, container.session, container.navigator,
        )
    }
    LaunchedEffect(route) { vm.clearTransient() } // fresh transient state on each sub-screen
    when (route) {
        CustomerNavKey.Account -> AccountScreen(container, vm, customer)
        CustomerNavKey.MyDetails -> PersonalDetailsScreen(container, customer)
        CustomerNavKey.Security -> SecurityScreen(container, vm, customer)
        CustomerNavKey.Privacy -> PrivacyScreen(container)
        CustomerNavKey.DeleteAccount -> DeleteAccountScreen(container)
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
        // ⚠ 034 FR-002 — THE HEADER IS THE TAP TARGET, and there is no "My details" row any more
        // (FR-003). A shopper looking for "where do I change my name" gets no signal from a header
        // that is pure decoration sitting above a row that duplicates it. One target, the obvious one.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = EffyMinTouchTarget)
                .clickable { nav.push(CustomerNavKey.MyDetails) }
                .padding(EffySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            // 034 FR-061 — the avatar stays GENERATED FROM INITIALS. No upload is introduced, so
            // feature 012's FR-001…FR-005 stand unamended; the header merely becomes activatable.
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
            Icon(
                painter = painterResource(Res.drawable.ic_arrow_back),
                contentDescription = null,
                modifier = Modifier.size(18.dp).rotate(180f),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // ⚠ FR-004/FR-005 — Saved items and Notifications as ICON SHORTCUTS.
        //
        // Built CONTAINER-FREE (icon + label, no filled tile), deliberately departing from the
        // reference screenshot. Principle V permits a card only when it is demonstrably the right
        // pattern and NO BETTER LAYOUT EXISTS — and one plainly does here, which is the same quiet
        // treatment the rest of this screen already uses. Recorded in plan.md § Complexity Tracking.
        //
        // Each carries a VISIBLE TEXT LABEL: an icon alone fails FR-005 and is unusable at the
        // largest text sizes and with a screen reader.
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            AccountShortcut(
                label = "Saved items",
                icon = Res.drawable.ic_favorite_outlined,
                onClick = { nav.push(CustomerNavKey.Saved) },
                modifier = Modifier.weight(1f),
            )
            AccountShortcut(
                label = "Notifications",
                icon = Res.drawable.ic_notifications_outlined,
                onClick = { nav.push(CustomerNavKey.Notifications) },
                modifier = Modifier.weight(1f),
            )
            AccountShortcut(
                label = "Orders",
                icon = Res.drawable.ic_orders_outlined,
                onClick = { nav.push(CustomerNavKey.Orders) },
                modifier = Modifier.weight(1f),
            )
        }

        Spacer(Modifier.height(EffySpacing.md))

        // ⚠ FR-006 — LABELLED SECTIONS, not one undifferentiated list of eleven rows with a blank
        // gap doing the grouping. SC-004 bounds this at ≤4 groups of ≤6 items.
        AccountSectionHeader("Shopping")
        EffyNavRow("Address book", onClick = { nav.push(CustomerNavKey.AddressBook) })

        AccountSectionHeader("Account")
        EffyNavRow("Security", onClick = { nav.push(CustomerNavKey.Security) })
        EffyNavRow("Privacy & data", onClick = { nav.push(CustomerNavKey.Privacy) })

        AccountSectionHeader("Help")
        EffyNavRow("FAQs", onClick = { nav.push(CustomerNavKey.Faqs) })
        EffyNavRow("Help Center", onClick = { nav.push(CustomerNavKey.HelpCenter) })
        EffyNavRow("Customer Service", onClick = { nav.push(CustomerNavKey.CustomerService) })

        // ⚠ FR-007 — NO SIGN-OUT CONTROL ON THIS SCREEN.
        //
        // Both sign-out rows used to sit here, styled destructive, immediately below ordinary
        // navigation rows — a stray tap while browsing ended the session. They now live on Security,
        // with the other credential actions. See SC-005.

        Spacer(Modifier.height(EffySpacing.xl))

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

/**
 * An account-root shortcut — icon over a VISIBLE label (034 FR-004/FR-005).
 *
 * ⚠ No filled container, deliberately. See the note at the call site: Principle V's card rule is not
 * satisfied by "a tile looks nice", and a container-free treatment is both compliant and consistent
 * with the rows below it.
 */
@Composable
private fun AccountShortcut(
    label: String,
    icon: DrawableResource,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            // FR-055 — the whole shortcut is the target, not just the glyph.
            .heightIn(min = 72.dp)
            .clickable(onClick = onClick)
            .padding(vertical = EffySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
    ) {
        Icon(
            painter = painterResource(icon),
            // The label below is the accessible name; a duplicate description would have a screen
            // reader announce the same words twice.
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            tint = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** A section heading on the account root (FR-006). */
@Composable
private fun AccountSectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(
            start = EffySpacing.lg,
            end = EffySpacing.lg,
            top = EffySpacing.lg,
            bottom = EffySpacing.xs,
        ),
    )
}

/**
 * Security — composed from the credentials the account ACTUALLY holds (034 FR-025).
 *
 * ⚠ NOT A FIXED ROW LIST, and that is the point. Effy's customer pool has three credential routes
 * (email+password, email OTP, Google), so a screen that always shows "Change password" is wrong for
 * a large share of customers — the presentation half of the defect feature 012 found in Cognito's
 * own semantics. Uber is a poor reference here precisely because it has no passwordless account.
 *
 * ⚠ SIGN OUT LIVES HERE NOW (FR-028), not on the account root where a stray tap could reach it.
 */
@Composable
private fun SecurityScreen(container: AppContainer, vm: AccountViewModel, customer: Customer) {
    val state by vm.state.collectAsState()
    val nav = container.navigator
    var confirmingSignOutAll by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Security", onBack = { container.navigator.pop() })
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {

            AccountSectionHeader("Signing in")

            // FR-026 — a password row OR an invitation to set one. NEVER both.
            if (customer.hasPassword) {
                EffyValueRow(
                    label = "Password",
                    value = customer.passwordSetAtIso?.let { "Last changed ${it.take(10)}" }
                        ?: "Set",
                    onClick = { nav.push(CustomerNavKey.Password(setFirst = false)) },
                )
            } else {
                EffyValueRow(
                    label = "Password",
                    value = "Not set — add one for another way to sign in",
                    onClick = { nav.push(CustomerNavKey.Password(setFirst = true)) },
                )
            }
            EffyHairline()

            AccountSectionHeader("Sessions")

            // ⚠ FR-030 — NOT styled destructive, settling the disagreement between the two customer
            // surfaces in favour of the web's position. Signing out is trivially reversible: you sign
            // back in. Destructive styling is now reserved for account deletion, which is the first
            // genuinely irreversible action this area has ever had — and if sign-out is already
            // wearing red, deletion has no stronger signal left to reach for.
            EffyNavRow("Sign out", onClick = { vm.signOut() }, showChevron = false)
            EffyNavRow(
                "Sign out on all devices",
                supporting = "Ends every session, including this one",
                onClick = { confirmingSignOutAll = true },
                showChevron = false,
            )

            state.error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
                )
            }
        }
    }

    // FR-029 — confirmation for ALL devices only. It affects sessions the shopper cannot see, which
    // is exactly the case where a confirmation earns its interruption; ordinary sign-out does not.
    if (confirmingSignOutAll) {
        AlertDialog(
            onDismissRequest = { confirmingSignOutAll = false },
            title = { Text("Sign out everywhere?") },
            text = { Text("This ends every session, including the one on this device.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingSignOutAll = false
                    vm.signOutEverywhere()
                }) { Text("Sign out everywhere") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingSignOutAll = false }) { Text("Cancel") }
            },
        )
    }
}

/**
 * Privacy & data (034 US6) — and the host for account deletion.
 *
 * ⚠ THE DELETION CONTROL IS THE LAST ITEM (FR-039), deliberately, and one navigation level deep.
 * Both stores name "account settings" as the canonical home and Apple's guidance warns against
 * burying the link; `Account → Privacy & data → bottom` matches the VERIFIED Uber path
 * (`Account → Settings → Privacy → Account Deletion`), so the placement is a judged risk rather than
 * an accident. SC-007 makes a fresh-account reviewer the test.
 */
@Composable
private fun PrivacyScreen(container: AppContainer) {
    val nav = container.navigator
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Privacy & data", onBack = { nav.pop() })
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {

            AccountSectionHeader("Privacy")
            Text(
                "We keep your orders and payment records after you leave, because tax and " +
                    "accounting rules require it. Everything else goes with your account.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
            )

            // ⚠ FR-052/FR-052a — these links are required by BOTH stores, and the documents behind
            // them do not exist yet. The content is legally reviewed and operator-owned; placeholder
            // legal text would defeat SC-010, which requires every claim to be true of the built
            // system. Tracked in SUBMISSION-BLOCKERS.md.
            EffyNavRow("Privacy policy", onClick = { nav.push(CustomerNavKey.Privacy) })
            EffyNavRow("Terms of service", onClick = { nav.push(CustomerNavKey.Privacy) })

            Spacer(Modifier.height(EffySpacing.xxxl))

            // The LAST item on the screen (FR-039).
            EffyNavRow(
                "Delete account",
                supporting = "Permanently remove your account and personal data",
                onClick = { nav.push(CustomerNavKey.DeleteAccount) },
                destructive = true,
            )
            Spacer(Modifier.height(EffySpacing.xl))
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

