package com.effyshopping.customer.mobile.features.account.presentation

import androidx.compose.foundation.selection.selectableGroup
import com.effyshopping.customer.mobile.resources.lucide_sun_moon
import com.effyshopping.customer.mobile.core.theme.AppearanceMode
import com.effyshopping.customer.mobile.core.presentation.EffyRadioRow
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.points.presentation.formatPoints
import com.effyshopping.customer.mobile.resources.lucide_trash_2
import com.effyshopping.customer.mobile.resources.lucide_smartphone
import com.effyshopping.customer.mobile.resources.lucide_log_out
import com.effyshopping.customer.mobile.resources.lucide_key_round
import com.effyshopping.customer.mobile.core.presentation.EffySwitchRow
import com.effyshopping.customer.mobile.core.presentation.EffyConfirmSheet
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.border
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.runtime.produceState
import com.effyshopping.customer.mobile.resources.lucide_file_text
import com.effyshopping.customer.mobile.resources.lucide_message_square
import com.effyshopping.customer.mobile.resources.lucide_mail
import com.effyshopping.customer.mobile.resources.lucide_info
import com.effyshopping.customer.mobile.resources.lucide_circle_help
import com.effyshopping.customer.mobile.resources.lucide_lock
import com.effyshopping.customer.mobile.resources.lucide_shield
import com.effyshopping.customer.mobile.resources.lucide_credit_card
import com.effyshopping.customer.mobile.resources.lucide_map_pin
import com.effyshopping.customer.mobile.resources.lucide_bell
import com.effyshopping.customer.mobile.resources.lucide_package
import com.effyshopping.customer.mobile.resources.lucide_heart
import com.effyshopping.customer.mobile.resources.lucide_coins
import com.effyshopping.customer.mobile.features.points.domain.PointsBalance
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffyRowIcon
import com.effyshopping.customer.mobile.core.presentation.EffyGroupDivider
import com.effyshopping.customer.mobile.core.presentation.EffyGroup
import com.effyshopping.customer.mobile.core.presentation.EffyCard
import com.effyshopping.customer.mobile.core.presentation.EffyChevron
import com.effyshopping.customer.mobile.core.presentation.effyPress
import com.effyshopping.customer.mobile.core.presentation.EffySize
import com.effyshopping.customer.mobile.core.presentation.rememberEffyCollapse
import com.effyshopping.customer.mobile.core.presentation.EffyLargeTitleBar
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
import androidx.compose.material3.Switch
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
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.core.observability.ConsentState
import com.effyshopping.customer.mobile.core.observability.analyticsConsentSubtitle
import com.effyshopping.customer.mobile.core.presentation.EffyNavRow
import com.effyshopping.customer.mobile.features.help.presentation.HelpScreen
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
 * Account management. Setting a first password needs an emailed code, verified by the backend in the same
 * request; changing one needs the current password. Both go to `edge-api/customer`, never Cognito. A
 * password write revokes every session, this one included.
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

    /** Step 1 of set-password: email the step-up code. Returns the masked destination. */
    fun sendSetPasswordCode() = launch {
        val masked = requestPasswordChallengeUseCase()
        _state.value = _state.value.copy(maskedDestination = masked, info = "Enter the code we sent to $masked.")
    }

    /** Step 2: write the first password with the emailed code. Revokes all sessions → return to sign-in. */
    fun setPassword(code: String, newPassword: String) = run {
        if (!longEnough(newPassword)) return@run
        launch {
            setPasswordUseCase(code, newPassword)
            finishAfterPasswordWrite()
        }
    }

    /** Change an existing password; the current one is required. Revokes all sessions. */
    fun changePassword(current: String, newPassword: String) = run {
        if (!longEnough(newPassword)) return@run
        launch {
            changePasswordUseCase(current, newPassword)
            finishAfterPasswordWrite()
        }
    }

    fun signOut() = launch {
        session.signOutLocally()
        goHomeAsGuest()
    }

    fun signOutEverywhere() = launch {
        runCatching { signOutEverywhereUseCase() }
        session.signOutLocally()
        goHomeAsGuest()
    }

    /**
     * Signing out lands on Home's root (the app is guest-first). Both tabs are cleared: `resetToRoot` acts on
     * the active tab only, so Account would otherwise keep the signed-in screen just left. The device is
     * already wiped (`signOutLocally` runs `onSignedOut`).
     */
    private fun goHomeAsGuest() {
        navigator.resetToRoot()
        navigator.selectTab(CustomerNavKey.Home)
        navigator.resetToRoot()
    }

    /** Reset transient state (error/info/masked destination) so one sub-screen's error doesn't bleed
     *  onto another when navigating between Account / EditName / Password. */
    fun clearTransient() {
        _state.value = AccountUiState()
    }

    private suspend fun finishAfterPasswordWrite() {
        // The write revoked every session, including this device. Back to sign-in with the news.
        session.signOutLocally()
        // Sign-in is pushed onto home, not onto the Account tab. Backing out of it has to land on a
        // screen a guest can actually see, and the Account tab's guest page no longer exists.
        goHomeAsGuest()
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
        // Defensive: only a signed-in customer reaches here. Without a session there is no account
        // page to fall back to any more, so leave for the store.
        container.navigator.resetToRoot()
        container.navigator.selectTab(CustomerNavKey.Home)
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
        // Two journeys, chosen only by the platform-owned `hasPassword`, never by how the
        // shopper signed in. A Google-linked customer is an ordinary native user and can hold one.
        is CustomerNavKey.Password ->
            if (route.setFirst) SetPasswordScreen(container, customer.email)
            else ChangePasswordScreen(container, customer.email)
        CustomerNavKey.PasswordReset -> ResetPasswordScreen(container, customer.email)
        // The new screens. Each is presentational and carries no session requirement of its
        // own; reaching them via Account is what already gates them.
        CustomerNavKey.Notifications -> NotificationsScreen()
        CustomerNavKey.Faqs, CustomerNavKey.HelpCenter, CustomerNavKey.CustomerService ->
            HelpScreen(onOpenOrders = { container.navigator.selectTab(CustomerNavKey.Orders) })
        else -> {}
    }
}

@Composable
private fun AccountScreen(container: AppContainer, vm: AccountViewModel, customer: Customer) {
    val state by vm.state.collectAsState()
    val nav = container.navigator
    val collapse = rememberEffyCollapse()
    val appearance by container.appearance.collectAsState()
    var choosingAppearance by remember { mutableStateOf(false) }
    if (choosingAppearance) {
        EffySheet(title = "Appearance", onDismiss = { choosingAppearance = false }, cancelLabel = "Done") {
            Column(Modifier.selectableGroup()) {
                AppearanceMode.entries.forEach { mode ->
                    EffyRadioRow(
                        label = mode.label,
                        supporting = if (mode == AppearanceMode.System) "Light or dark, as your phone is set" else null,
                        selected = mode == appearance,
                        onClick = { container.setAppearance(mode) },
                    )
                }
            }
        }
    }
    // 087 (Account board) — the points card at the top. A failed read shows the card without numbers
    // rather than an error: points are a shortcut here, the Points page owns the failure.
    val points by produceState<PointsBalance?>(null, customer.id) {
        value = runCatching { container.getPoints().first }.getOrNull()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyLargeTitleBar(title = "Account", collapse = collapse)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .nestedScroll(collapse.connection)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
        ) {
            // The header is the tap target for personal info; there is no separate row.
            val interactions = remember { MutableInteractionSource() }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = EffySize.rowWithSubtitle)
                    .effyPress(interactions, 0.98f)
                    .clickable(interactionSource = interactions, indication = null, role = Role.Button) { nav.push(CustomerNavKey.MyDetails) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
            ) {
                InitialsAvatar(customer.name.initials)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        customer.name.display.takeIf { it.isNotBlank() }?.let { "Hi ${customer.name.given ?: it}" } ?: "Your account",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(customer.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                EffyChevron()
            }

            // Effy points — a way of paying, said in blue (the storefront's points colour).
            EffyCard(onClick = { nav.push(CustomerNavKey.Points) }, selected = false) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("EFFY POINTS", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        val p = points
                        Text(
                            if (p != null) formatPoints(p.points) else "Your points",
                            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum"),
                            color = MaterialTheme.colorScheme.primary,
                        )
                        if (p != null) {
                            Text(
                                buildString {
                                    append("worth ${money(p.valueAmount, "AUD")}")
                                    p.nextExpiry?.let { append(" · ${formatPoints(it.points)} can be used until ${DeliveryWindowText.formatDay(it.date)}") }
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Icon(painterResource(Res.drawable.lucide_coins), contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                }
            }

            // Three shortcuts (FR-004/FR-005 — each with a visible label).
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                AccountShortcut("Saved", Res.drawable.lucide_heart, { nav.push(CustomerNavKey.Saved) }, Modifier.weight(1f))
                AccountShortcut("Orders", Res.drawable.lucide_package, { nav.push(CustomerNavKey.Orders) }, Modifier.weight(1f))
                AccountShortcut("Notifications", Res.drawable.lucide_bell, { nav.push(CustomerNavKey.Notifications) }, Modifier.weight(1f))
            }

            // Labelled groups, ≤4 groups of ≤6 rows.
            EffyGroup(caption = "Shopping") {
                AccountRow("Address book", Res.drawable.lucide_map_pin) { nav.push(CustomerNavKey.AddressBook) }
                AccountRow("Payment methods", Res.drawable.lucide_credit_card) { nav.push(CustomerNavKey.PaymentMethods) }
                AccountRow("Effy points", Res.drawable.lucide_coins, last = true) { nav.push(CustomerNavKey.Points) }
            }
            EffyGroup(caption = "Account") {
                AccountRow("Security", Res.drawable.lucide_shield) { nav.push(CustomerNavKey.Security) }
                AccountRow("Privacy & data", Res.drawable.lucide_lock) { nav.push(CustomerNavKey.Privacy) }
                // Light, Dark, or Match my phone; a sheet, remembered on this device.
                EffyNavRow(
                    "Appearance",
                    onClick = { choosingAppearance = true },
                    leading = { EffyRowIcon(Res.drawable.lucide_sun_moon) },
                    trailingText = appearance.label,
                    divider = false,
                )
            }
            EffyGroup(caption = "Help") {
                // One help page (Help board): answers, contact, and a way to report an order.
                AccountRow("Help", Res.drawable.lucide_circle_help) { nav.push(CustomerNavKey.HelpCenter) }
                // Give feedback (guest or signed-in).
                AccountRow("Give feedback", Res.drawable.lucide_message_square, last = true) { nav.push(CustomerNavKey.Feedback) }
            }
            // The one entry to the full legal list (About is inside it).
            EffyGroup(caption = "Legal") {
                AccountRow("Legal & policies", Res.drawable.lucide_file_text, last = true) { nav.push(CustomerNavKey.LegalIndex) }
            }

            // No sign-out control on this screen; it lives on Security.

            state.error?.let { EffyInlineError(it) }
            Text(
                "Effy for iPhone and Android",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = EffySpacing.lg),
            )
        }
    }
}

/** An account shortcut — a bordered square with an icon over a visible label (Account board). */
@Composable
private fun AccountShortcut(label: String, icon: DrawableResource, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val interactions = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .heightIn(min = 80.dp)
            .effyPress(interactions, 0.96f)
            .clip(EffyStorefrontShape.card)
            .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.card)
            .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClick = onClick)
            .padding(vertical = EffySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(EffySpacing.s, Alignment.CenterVertically),
    ) {
        Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** One row in an account group. */
@Composable
private fun AccountRow(label: String, icon: DrawableResource, last: Boolean = false, onClick: () -> Unit) {
    EffyNavRow(label, onClick = onClick, leading = { EffyRowIcon(icon) }, divider = false)
    if (!last) EffyGroupDivider()
}

/**
 * Security, composed from the credentials the account actually holds (email+password, email code,
 * Google), so "Change password" is not shown to someone with none. Sign out lives here, away from a stray
 * tap on the account root.
 */
@Composable
private fun SecurityScreen(container: AppContainer, vm: AccountViewModel, customer: Customer) {
    val state by vm.state.collectAsState()
    val nav = container.navigator
    var confirmingSignOutAll by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Security")
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
        ) {
            // A password row OR an invitation to set one. Never both.
            EffyGroup(caption = "Signing in") {
                EffyNavRow(
                    "Password",
                    leading = { EffyRowIcon(Res.drawable.lucide_key_round) },
                    supporting = if (customer.hasPassword) {
                        customer.passwordSetAtIso?.let { "Last changed ${it.take(10)}" } ?: "Set"
                    } else {
                        "Not set — add one for another way to sign in"
                    },
                    trailingText = if (customer.hasPassword) "Change" else "Add",
                    onClick = { nav.push(CustomerNavKey.Password(setFirst = !customer.hasPassword)) },
                    showChevron = false,
                    divider = false,
                )
            }

            // Sign-out is not destructive (you sign back in).
            EffyGroup(caption = "Sessions") {
                EffyNavRow(
                    "Sign out",
                    leading = { EffyRowIcon(Res.drawable.lucide_log_out) },
                    onClick = { vm.signOut() },
                    showChevron = false,
                    divider = false,
                )
                EffyGroupDivider()
                EffyNavRow(
                    "Sign out on all devices",
                    leading = { EffyRowIcon(Res.drawable.lucide_smartphone) },
                    supporting = "Ends every session, including this one",
                    onClick = { confirmingSignOutAll = true },
                    showChevron = false,
                    divider = false,
                )
            }

            state.error?.let { EffyInlineError(it) }
        }
    }

    // Confirmation for all devices only. 087: a bottom sheet with its actions pinned
    // (Security board), never a dialog.
    if (confirmingSignOutAll) {
        EffyConfirmSheet(
            title = "Sign out everywhere?",
            body = "This ends every session, including this one. You'll need to sign in again on each device.",
            confirmLabel = "Sign out everywhere",
            cancelLabel = "Stay signed in",
            icon = Res.drawable.lucide_log_out,
            destructive = true,
            onConfirm = {
                confirmingSignOutAll = false
                vm.signOutEverywhere()
            },
            onDismiss = { confirmingSignOutAll = false },
        )
    }
}

/**
 * Privacy & data, and the host for account deletion: the last item, one level deep (the stores name
 * account settings as its home and warn against burying it).
 */
@Composable
private fun PrivacyScreen(container: AppContainer) {
    val nav = container.navigator
    var analyticsOn by remember { mutableStateOf(container.analyticsConsent() == ConsentState.GRANTED) }
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Privacy & data")
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
        ) {
            Text(
                "We keep your orders and payment records after you leave, because tax and " +
                    "accounting rules require it. Everything else goes with your account.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            EffyGroup(caption = "Privacy") {
                // An in-app privacy policy link is required by both stores and belongs here.
                EffyNavRow(
                    "Privacy policy",
                    leading = { EffyRowIcon(Res.drawable.lucide_file_text) },
                    onClick = { nav.push(CustomerNavKey.LegalDocument("privacy-policy")) },
                    divider = false,
                )
                EffyGroupDivider()
                // The standing analytics opt-in/out control (crash reporting unaffected).
                EffySwitchRow(
                    label = "Share usage analytics",
                    supporting = analyticsConsentSubtitle(if (analyticsOn) ConsentState.GRANTED else ConsentState.DENIED),
                    checked = analyticsOn,
                    onCheckedChange = { on ->
                        analyticsOn = on
                        container.setAnalyticsConsent(on)
                    },
                )
            }

            // Debug-only observability test panel (DEBUG_TOOLS=true only, never in prod).
            if (AppConfig.debugTools) {
                EffyGroup(caption = "Developer — observability test") {
                    EffyNavRow("Fire test analytics event", onClick = { container.analyticsDriver.capture(AnalyticsEvent.ScreenViewed("debug_test")) }, showChevron = false)
                    EffyNavRow("Log non-fatal error", onClick = { container.crashReporter.logNonFatal(RuntimeException("Effy test non-fatal (050)")) }, showChevron = false)
                    EffyNavRow("Force crash", onClick = { throw RuntimeException("Effy test crash (050)") }, showChevron = false, divider = false)
                }
            }

            // The last item on the screen. Black, with its own icon and words — no red.
            EffyGroup {
                EffyNavRow(
                    "Delete account",
                    leading = { EffyRowIcon(Res.drawable.lucide_trash_2) },
                    supporting = "Permanently remove your account and personal data",
                    onClick = { nav.push(CustomerNavKey.DeleteAccount) },
                    destructive = true,
                    divider = false,
                )
            }
        }
    }
}

@Composable
private fun InitialsAvatar(initials: String) {
    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(56.dp)) {
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

