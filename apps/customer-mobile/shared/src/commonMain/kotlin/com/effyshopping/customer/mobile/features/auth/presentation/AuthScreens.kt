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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_google_g
import org.jetbrains.compose.resources.painterResource
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.auth.AuthError
import com.effyshopping.customer.mobile.core.auth.AuthStep
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.nav.CUSTOMER_TAB_ROOTS
import com.effyshopping.customer.mobile.core.nav.CustomerNavigator
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.nav.OtpPurpose
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.features.auth.domain.ConfirmOtp
import com.effyshopping.customer.mobile.features.auth.domain.ResendSignInCode
import com.effyshopping.customer.mobile.features.auth.domain.ResendVerdict
import com.effyshopping.customer.mobile.features.auth.domain.cooldownAfterSend
import com.effyshopping.customer.mobile.features.auth.domain.resendVerdict
import com.effyshopping.customer.mobile.features.auth.domain.tallyAfterResend
import com.effyshopping.customer.mobile.features.auth.domain.tallyAttempt
import com.effyshopping.customer.mobile.features.auth.domain.ResendSignUpCode
import com.effyshopping.customer.mobile.features.account.domain.UpdateProfile
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
import com.effyshopping.customer.mobile.core.presentation.EffyBackArrow
import com.effyshopping.customer.mobile.core.presentation.EffyInlineLink
import com.effyshopping.customer.mobile.core.presentation.EffyOrDivider
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.effyshopping.customer.mobile.core.presentation.EffyPasswordField
import com.effyshopping.mobile.kit.ui.OtpInput
import com.effyshopping.mobile.kit.ui.OtpVariant
import com.effyshopping.mobile.kit.ui.OTP_LENGTH
import com.effyshopping.mobile.kit.ui.isCompleteOtp
import kotlinx.coroutines.delay

const val PASSWORD_MIN_LENGTH = 12 // mirrors the platform policy (shared-types PASSWORD_MIN_LENGTH)

/**
 * The auth flow's single observable state object (036 R2, constitution Principle VI).
 *
 * ⚠ THE PENDING-FLOW FIELDS USED TO BE LOOSE `var`s ON THE VIEWMODEL, and that was a real defect, not
 * a style point. `pendingEmail`, `pendingSeedPassword` and `pendingReturnTo` sat outside the state —
 * so they were not saved across process death, and an iOS process kill on the code step lost the very
 * address the code had been sent to. The screen could not even say where to look. Principle VI asks
 * for one immutable observable object; FR-022 asks that going backwards never loses a typed value.
 * Both are the same fix.
 */
/**
 * WHICH action is in flight — not merely that one is (036 A1).
 *
 * ⚠ A BOOLEAN WAS NOT ENOUGH, and the screenshot showed why: several auth screens offer two actions
 * ("Sign in" AND "Email me a code instead"), so a single `loading` flag could disable both and spin
 * *somewhere*, but could not say which one the shopper was waiting on. Naming the submission lets the
 * spinner live in the pressed control, where its position IS the answer.
 *
 * ⚠ Copied from `apps/shop-mobile`'s `AuthSubmission`, which had this shape already — the customer app
 * simply never gained it.
 */
enum class AuthSubmission {
    Idle,
    SendingCode,
    ConfirmingCode,
    ResendingCode,
    SigningIn,
    Registering,
    SavingName,
    ResettingPassword,
}

data class AuthUiState(
    val submission: AuthSubmission = AuthSubmission.Idle,
    val error: String? = null,
    val info: String? = null,
    /** The address in play — shown on the code step so the shopper knows where to look (FR-006). */
    val email: String = "",
    /** Cognito's masked destination when it gives us one; otherwise the address itself. */
    val maskedDestination: String? = null,
    /** Wrong codes so far in THIS session. The platform's cap is 3 (`OTP_MAX_ATTEMPTS`). */
    val attemptsUsed: Int = 0,
    /**
     * Codes sent in THIS flow. ⚠ The platform allows five per address per clock hour and the SIXTH is
     * refused while STILL returning a normal-looking challenge — so the shopper would be shown a code
     * screen for an email that does not exist. Counting locally is the only honest defence.
     */
    val sendsThisFlow: Int = 0,
    /** Seconds until "send another code" becomes available. */
    val resendRemaining: Int = 0,
    /** True once the attempt allowance is spent — the session is over, not merely wrong. */
    val exhausted: Boolean = false,
    val seedPassword: Boolean = false,
    val returnTo: CustomerNavKey? = null,
) {
    /** Anything in flight. Kept so every existing `enabled = !state.loading` read still holds. */
    val loading: Boolean get() = submission != AuthSubmission.Idle

    /** Is THIS control the one that is waiting? */
    fun busyWith(action: AuthSubmission): Boolean = submission == action
}

/**
 * ⚠ The ceiling, the attempt cap and the cooldown now live in
 * `features/auth/domain/OtpFlowRules.kt` as PURE FUNCTIONS — see the note there. They were private
 * consts and inline `if`s in this file, which is why the two rules most likely to strand a shopper
 * had no test on either mobile app.
 */

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
    private val resendSignInCodeUseCase: ResendSignInCode,
    private val resendSignUpCodeUseCase: ResendSignUpCode,
    private val updateProfileUseCase: UpdateProfile,
    private val startPasswordResetUseCase: StartPasswordReset,
    private val confirmPasswordResetUseCase: ConfirmPasswordReset,
    private val session: SessionManager,
    private val navigator: CustomerNavigator,
) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state = _state.asStateFlow()

    fun clearError() { _state.value = _state.value.copy(error = null) }

    /**
     * ⚠ FR-039 — the honest refusal for a control that is deliberately not wired.
     *
     * Google is parked: no hosted domain exists, so there is nothing to redirect to. Attempting a real
     * federated sign-in would surface a generic "something went wrong", which is a lie — nothing went
     * wrong, the capability is not built. Saying which is the whole point of shipping the button now.
     */
    fun showGoogleUnavailable() {
        _state.value = _state.value.copy(
            error = "Google sign-in isn’t available yet. " +
                "For now, use your email — we’ll send you a code.",
        )
    }

    /**
     * Clear the visible error/info when entering a new step.
     *
     * ⚠ IT MUST NOT RESET THE WHOLE STATE. It used to be `_state.value = AuthUiState()`, which was
     * harmless only because the flow state (email, seed, returnTo) lived OUTSIDE the state object as
     * loose `var`s. Now that 036 has moved them in — which is what Principle VI asks for and what
     * makes them survive process death — a blanket reset here would wipe the address on the way to
     * the code step, and the screen could no longer say where the code had gone.
     */
    fun clearTransient() { _state.value = _state.value.copy(error = null, info = null) }

    /**
     * ⚠ 036 FR-032 — NO NAME ARGUMENTS. It is the LAST step now, asked once the account exists.
     * ⚠ The address is lowercased as well as trimmed: the platform's per-address rate limit is keyed
     * on `HMAC(email)`, so `A@x.com` and `a@x.com` would consume two separate hourly buckets.
     */
    fun registerWithPassword(email: String, password: String) = run {
        if (!passwordLongEnough(password)) return@run
        beginFlow(email, seedPassword = true, returnTo = null)
        drive(AuthSubmission.Registering, registration = true) { registerWithPasswordUseCase(normalise(email), password) }
    }

    fun registerPasswordless(email: String) {
        beginFlow(email, seedPassword = false, returnTo = null)
        drive(AuthSubmission.SendingCode, registration = true) { registerPasswordlessUseCase(normalise(email)) }
    }

    fun signInWithPassword(email: String, password: String, returnTo: CustomerNavKey?) {
        beginFlow(email, seedPassword = false, returnTo = returnTo)
        drive(AuthSubmission.SigningIn, registration = false) { signInWithPasswordUseCase(normalise(email), password) }
    }

    fun signInWithOtp(email: String, returnTo: CustomerNavKey?) {
        beginFlow(email, seedPassword = false, returnTo = returnTo)
        drive(AuthSubmission.SendingCode, registration = false) { signInWithEmailOtpUseCase(normalise(email)) }
    }

    /**
     * Send another code (036 FR-007, FR-009).
     *
     * ⚠ The ceiling is checked BEFORE the call. Past five sends in this flow the platform silently
     * refuses while still returning a normal challenge, so firing anyway would leave the shopper
     * waiting for an email that does not exist. Refusing here, out loud, is the only honest option.
     */
    fun resendCode(purpose: OtpPurpose) {
        val s = _state.value
        when (resendVerdict(s.sendsThisFlow, s.resendRemaining, s.loading)) {
            ResendVerdict.Busy, ResendVerdict.Cooldown -> return
            ResendVerdict.Ceiling -> {
                _state.value = s.copy(
                    error = "We can't send another code to this address right now. " +
                        "Check your spam folder, or try again later.",
                )
                return
            }
            ResendVerdict.Allowed -> Unit
        }
        launch(AuthSubmission.ResendingCode) {
            val step = when (purpose) {
                OtpPurpose.SIGN_UP -> resendSignUpCodeUseCase(s.email)
                else -> resendSignInCodeUseCase(s.email)
            }
            _state.value = when (step) {
                is AuthStep.Failed -> _state.value.copy(error = message(step.error, s.seedPassword))
                else -> _state.value.copy(
                    error = null,
                    // ⚠ Point at the NEWEST email. Two codes can arrive out of order and the older one
                    // no longer works; a shopper reading top-down has no way to tell which is which.
                    info = "New code sent. Use the most recent email — the older code no longer works.",
                    // ⚠ A resend starts a NEW Cognito session, whose attempt list is empty.
                    attemptsUsed = tallyAfterResend().used,
                    exhausted = tallyAfterResend().exhausted,
                )
            }
            noteCodeSent()
        }
    }

    fun submitOtp(route: CustomerNavKey.VerifyOtp, code: String) {
        when (route.purpose) {
            OtpPurpose.SIGN_IN -> drive(AuthSubmission.ConfirmingCode, registration = false) { confirmOtpUseCase(code) }
            OtpPurpose.SIGN_UP -> drive(AuthSubmission.ConfirmingCode, registration = true) { confirmSignUpUseCase(route.email, code) }
            // ⚠ Recovery has its own screen (code + new password, finished at the backend). This
            // branch was an empty `{}` — a declared, serialised, round-trip-tested DEAD BRANCH. It now
            // says so rather than silently doing nothing when tapped.
            OtpPurpose.RECOVERY ->
                _state.value = _state.value.copy(error = "Use the reset screen to choose a new password.")
        }
    }

    /** The final registration step (036 FR-035). Writes the name, then finishes the journey. */
    fun saveName(given: String, family: String) {
        if (given.isBlank() || family.isBlank()) {
            _state.value = _state.value.copy(error = "Please tell us both names.")
            return
        }
        launch(AuthSubmission.SavingName) {
            try {
                // ⚠ `phone = ""` means "clear", and that is correct here: a brand-new account has no phone,
                // and the backend maps empty→NULL on the same path the names use. Passing anything else
                // would invent a value the customer never gave.
                updateProfileUseCase(given.trim(), family.trim(), "")
                // ⚠ Home, and ONLY here. See `finishJourney`.
                finishJourney(landOnHome = true)
            } catch (e: AppException) {
                _state.value = _state.value.copy(error = messageForApp(e))
            }
        }
    }

    fun sendRecoveryCode(email: String) {
        _state.value = _state.value.copy(email = normalise(email))
        launch(AuthSubmission.SendingCode) {
            when (val step = startPasswordResetUseCase(email)) {
                is AuthStep.NeedsOtp ->
                    _state.value = _state.value.copy(
                        error = null,
                        info = "Enter the code we emailed and choose a new password.",
                    )
                is AuthStep.Failed -> _state.value = _state.value.copy(error = message(step.error, true))
                else -> _state.value = _state.value.copy(error = "Something went wrong. Try again.")
            }
        }
    }

    fun confirmRecovery(email: String, code: String, newPassword: String) {
        if (!passwordLongEnough(newPassword)) return
        launch(AuthSubmission.ResettingPassword) {
            try {
                confirmPasswordResetUseCase(email, code, newPassword)
                _state.value = AuthUiState(info = "Password updated. Sign in with your new password.")
                navigator.resetToRoot()
                navigator.push(CustomerNavKey.SignIn())
            } catch (e: AppException) {
                _state.value = _state.value.copy(error = messageForApp(e))
            }
        }
    }

    // ── plumbing ─────────────────────────────────────────────────────────────────────────────────

    /** ⚠ Lowercased as well as trimmed — the rate-limit key is `HMAC(email)`. */
    private fun normalise(email: String) = email.trim().lowercase()

    private fun beginFlow(email: String, seedPassword: Boolean, returnTo: CustomerNavKey?) {
        _state.value = AuthUiState(
            email = normalise(email),
            seedPassword = seedPassword,
            returnTo = returnTo,
        )
    }

    /** Start the cooldown and count the send. */
    private fun noteCodeSent() {
        _state.value = _state.value.copy(
            sendsThisFlow = _state.value.sendsThisFlow + 1,
            resendRemaining = cooldownAfterSend(),
        )
        viewModelScope.launch {
            while (_state.value.resendRemaining > 0) {
                delay(1_000)
                _state.value = _state.value.copy(resendRemaining = _state.value.resendRemaining - 1)
            }
        }
    }

    private fun passwordLongEnough(pw: String): Boolean {
        if (pw.length < PASSWORD_MIN_LENGTH) {
            _state.value = _state.value.copy(error = "Use at least $PASSWORD_MIN_LENGTH characters.")
            return false
        }
        return true
    }

    private fun drive(action: AuthSubmission, registration: Boolean, block: suspend () -> AuthStep) {
        launch(action) {
            val before = _state.value
            when (val step = block()) {
                // ⚠ After REGISTRATION the journey is not over: the name is the last step (FR-032).
                is AuthStep.Done ->
                    if (registration) {
                        session.onSignedIn(before.seedPassword)
                        navigator.push(CustomerNavKey.ProfileName)
                    } else {
                        finishJourney(landOnHome = false)
                    }
                is AuthStep.NeedsOtp -> {
                    // ⚠ The masked destination is finally KEPT. Both drivers have always populated it
                    // and this ViewModel threw it away, which is why the code screen could never say
                    // where it had sent anything (FR-006).
                    _state.value = before.copy(error = null, maskedDestination = step.destination)
                    noteCodeSent()
                    navigator.push(
                        CustomerNavKey.VerifyOtp(before.email, OtpPurpose.SIGN_IN, before.returnTo),
                    )
                }
                is AuthStep.NeedsSignUpConfirmation -> {
                    _state.value = before.copy(error = null, maskedDestination = step.email)
                    noteCodeSent()
                    navigator.push(
                        CustomerNavKey.VerifyOtp(before.email, OtpPurpose.SIGN_UP, before.returnTo),
                    )
                }
                is AuthStep.Failed -> {
                    // ⚠ A refused code is not a generic failure — it costs one of three attempts, and
                    // the third ends the session rather than merely being wrong (FR-013).
                    val codeRefused = step.error == AuthError.CodeIncorrect ||
                        step.error == AuthError.CodeExpired
                    val tally = tallyAttempt(before.attemptsUsed, codeRefused)
                    _state.value = before.copy(
                        error = message(step.error, before.seedPassword),
                        attemptsUsed = tally.used,
                        exhausted = tally.exhausted,
                    )
                }
            }
        }
    }

    /**
     * Where the shopper lands (036 FR-025, SC-013).
     *
     * ⚠ RETURN-TO-INTENT IS THE RULE; HOME IS THE EXCEPTION, and getting that backwards is a
     * regression I made and had to undo. The first version sent every sign-in with no explicit
     * `returnTo` to Home — which meant a guest who tapped **Orders**, was told "sign in to see your
     * orders", and did exactly that, arrived on **Discover**. The thing they asked for was one tap
     * away and they were sent somewhere else.
     *
     * `resetToRoot()` already lands them on the root of the tab that RAISED the demand, which is the
     * right answer for every gated tab: Orders → orders, Account → their account. So:
     *
     *   • an explicit non-tab-root [AuthUiState.returnTo] (checkout, a product) → push it;
     *   • otherwise → stay in the tab that asked, via its own root;
     *   • [landOnHome] → Home, and ONLY after a fresh REGISTRATION. A brand-new customer has no
     *     orders and an empty account, so neither tab root has anything to show them; Home is where
     *     shopping starts, and it is the one case the operator's "go to home page" describes.
     *
     * ⚠ `resetToRoot()` FIRST, NEVER `resetTo(Home)`. Sign-in runs inside whichever tab raised it, so
     * resetting to Home set that tab's stack to [Home] — after which tapping Account showed Discover,
     * for good. `CustomerNavState.resetTo` actively `require`s against it.
     */
    private suspend fun finishJourney(landOnHome: Boolean) {
        session.onSignedIn(_state.value.seedPassword)
        val returnTo = _state.value.returnTo
        navigator.resetToRoot()
        when {
            // They were interrupted mid-task — put them back exactly there.
            returnTo != null && returnTo !in CUSTOMER_TAB_ROOTS -> navigator.push(returnTo)
            // ⚠ They tapped a gated TAB and were asked to sign in instead of being shown a dead gate
            // (036 FR-053). Take them to the thing they actually pressed. `resetToRoot()` has already
            // returned the tab they were standing in to its own root, so this only switches tabs.
            returnTo != null -> navigator.selectTab(returnTo)
            landOnHome -> navigator.selectTab(CustomerNavKey.Home)
        }
    }

    private inline fun launch(action: AuthSubmission, crossinline block: suspend () -> Unit) {
        _state.value = _state.value.copy(submission = action, error = null)
        viewModelScope.launch {
            try {
                block()
            } finally {
                _state.value = _state.value.copy(submission = AuthSubmission.Idle)
            }
        }
    }

    /**
     * ⚠ ROUTE-AWARE, because the same failure means two different things (036 R10; 035's web fix,
     * finally brought to mobile).
     *
     * `NotAuthorizedException` collapses into [AuthError.InvalidCredentials], and on the PASSWORD
     * route that is a credential mismatch. On the CODE route it means the three attempts are spent.
     * Telling someone signing in passwordlessly that their "email or password isn't right" is nonsense
     * they cannot act on — there is no password to check. Mobile never got this fix; web did.
     *
     * ⚠ And the code-route wording is deliberately the same as an unknown address produces.
     * Distinguishing "you ran out of tries" from "no such account" would re-open the existence oracle
     * the whole flow exists to close (FR-024).
     */
    private fun message(e: AuthError, passwordRoute: Boolean): String = when (e) {
        AuthError.InvalidCredentials ->
            if (passwordRoute) "That email or password isn't right."
            else "That didn't work. Send a new code and try again."
        // ⚠ "wasn't accepted", not "is wrong". On the sign-in route the platform genuinely cannot tell
        // a mistyped code from an expired or superseded one — the trigger computes a reason and
        // discards it so the answer cannot be used to discover who has an account (FR-011).
        AuthError.CodeIncorrect -> "That code wasn't accepted. Check it and try again."
        AuthError.CodeExpired -> "That code has expired. Send another one."
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
fun AuthRoutes(container: AppContainer, route: CustomerNavKey) {
    val vm = viewModel {
        AuthViewModel(
            container.registerWithPassword, container.registerPasswordless, container.confirmSignUp,
            container.signInWithPassword, container.signInWithEmailOtp, container.confirmOtp,
            container.resendSignInCode, container.resendSignUpCode, container.updateProfile,
            container.startPasswordReset, container.confirmPasswordReset, container.session, container.navigator,
        )
    }
    LaunchedEffect(route) { vm.clearTransient() }
    when (route) {
        is CustomerNavKey.SignIn -> SignInScreen(container, vm, route.returnTo)
        is CustomerNavKey.SignInPassword -> SignInPasswordScreen(container, vm, route)
        CustomerNavKey.SignUp -> SignUpScreen(container, vm)
        is CustomerNavKey.SignUpPassword -> SignUpPasswordScreen(container, vm, route)
        CustomerNavKey.ProfileName -> ProfileNameScreen(container, vm)
        is CustomerNavKey.VerifyOtp -> VerifyOtpScreen(container, vm, route)
        CustomerNavKey.Recovery -> RecoveryScreen(container, vm)
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
    title: String,
    subtitle: String,
    state: AuthUiState,
    /**
     * The screen's bottom group — pinned above the keyboard, in the thumb's reach.
     *
     * ⚠ TWO DIFFERENT THINGS GO HERE, and which one depends on the screen. On a screen with ONE
     * committing action (the code step, the name step, a password step) it is that action. On a
     * screen offering several routes (sign-in step 1, sign-up step 1) the actions belong with the
     * fields they act on, and this holds only the opposite-journey link — "Don't have an account?
     * Join" — which is genuinely a footer.
     */
    bottomBar: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Scaffold(
        containerColor = EffySurface.page,
        bottomBar = {
            if (bottomBar != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = EffySpacing.lg)
                        .padding(top = EffySpacing.md, bottom = EffySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
                    content = bottomBar,
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = EffySpacing.lg)
                .padding(bottom = EffySpacing.xxxl),
        ) {
            // ⚠ Effy is GUEST-FIRST, so this is an adaptation of the source and not a copy of it. In
            // the kit the login screen IS the app's root — nothing precedes it, so it needs no way
            // back. Here sign-in is pushed over whatever the shopper was doing, and abandoning it
            // must be possible: without this arrow a guest who tapped Orders was left in the flow
            // with the tab bar hidden. It draws only when there is somewhere to return to.
            EffyBackArrow()

            Spacer(Modifier.height(EffySpacing.lg))

            // ── GROUP 1: what this screen is ────────────────────────────────────────────────────
            // Title and subtitle are ONE thought, so they sit at the tightest gap on the scale.
            EffyDisplay(title, size = DisplaySize.Page)
            Spacer(Modifier.height(EffySpacing.s))
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // ── The break between groups ────────────────────────────────────────────────────────
            //
            // ⚠ 40 dp, against 16 dp inside the groups. Gestalt proximity only does its work when the
            // between-group gap is unambiguously larger than the within-group one; at 16/20 it reads
            // as "slightly more space", not as a boundary, which is exactly why every element used to
            // look crammed into one undifferentiated stack.
            //
            // ⚠ 40 is `EffySpacing.xxxl` and 16 is `lg` — the scale jumps 20 → 40 with NO 24 or 32
            // step, so this is the honest choice from the tokens that exist. Adding a step would mean
            // editing the generator and committing three regenerated Compose files across three apps.
            Spacer(Modifier.height(EffySpacing.xxxl))

            // ── GROUP 2: what you do here ───────────────────────────────────────────────────────
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
                content()
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                state.info?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                // ⚠ NO PAGE-LEVEL SPINNER. It used to sit here, loose in the column: it could not say
                // WHICH of two actions was running, and it appeared and disappeared in the layout
                // flow, nudging everything below it. Progress now lives in the pressed button.
            }
        }
    }
}

/**
 * Sign-in, step 1 — the identifier (036 FR-016, FR-017).
 *
 * ⚠ THE CODE IS THE PRIMARY ROUTE NOW, AND PASSWORD IS A STEP. This screen used to ask for an email
 * AND a password together, with "Email me a code instead" as a bordered afterthought below an "Or"
 * divider — so the platform's default and, for most shoppers, only credential was the secondary
 * action. One decision per screen: the address, then how you want to prove it.
 */
@Composable
private fun SignInScreen(container: AppContainer, vm: AuthViewModel, returnTo: CustomerNavKey?) {
    val state by vm.state.collectAsState()
    var email by remember { mutableStateOf("") }

    AuthScaffold(
        title = "Sign in to Effy",
        subtitle = "It’s good to see you again.",
        state = state,
        bottomBar = {
            EffyInlineLink("Don’t have an account?", "Join", onClick = {
                container.navigator.push(CustomerNavKey.SignUp)
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
        EffyPrimaryButton(
            "Email me a code",
            onClick = { vm.signInWithOtp(email, returnTo) },
            enabled = !state.loading && email.isNotBlank(),
            loading = state.busyWith(AuthSubmission.SendingCode),
        )
        EffyOrDivider()
        // ⚠ The source design offers Google AND Facebook. Facebook stays DROPPED (FR-030a) — it is not
        // an Effy credential route. Google is offered because the operator asked for the control now
        // and the capability later; tapping it says so plainly rather than failing generically.
        GoogleSignInButton(enabled = !state.loading, onUnavailable = { vm.showGoogleUnavailable() })
        EffySecondaryButton(
            "Use a password instead",
            onClick = {
                container.navigator.push(CustomerNavKey.SignInPassword(email.trim().lowercase(), returnTo))
            },
            enabled = !state.loading && email.isNotBlank(),
        )
    }
}

/**
 * Sign-in, step 2 — the password (036 FR-018 … FR-020).
 *
 * ⚠ The address is DISPLAYED, never asked again: the previous step already has it.
 */
@Composable
private fun SignInPasswordScreen(
    container: AppContainer,
    vm: AuthViewModel,
    route: CustomerNavKey.SignInPassword,
) {
    val state by vm.state.collectAsState()
    var password by remember { mutableStateOf("") }

    AuthScaffold(
        title = "Enter your password",
        subtitle = "Signing in as ${route.email}.",
        state = state,
        bottomBar = {
            EffyInlineLink("Don’t have an account?", "Join", onClick = {
                container.navigator.push(CustomerNavKey.SignUp)
            })
        },
    ) {
        EffyPasswordField(
            "Password",
            password,
            { password = it },
            placeholder = "Enter your password",
        )
        // ⚠ FR-019 — reset lives HERE, on the step where the person who needs it is standing.
        EffyInlineLink("Forgot your password?", "Reset your password", onClick = {
            container.navigator.push(CustomerNavKey.Recovery)
        })
        EffyPrimaryButton(
            "Sign in",
            onClick = { vm.signInWithPassword(route.email, password, route.returnTo) },
            enabled = !state.loading && password.isNotBlank(),
            loading = state.busyWith(AuthSubmission.SigningIn),
        )
        EffySecondaryButton(
            "Email me a code instead",
            onClick = { vm.signInWithOtp(route.email, route.returnTo) },
            enabled = !state.loading,
            loading = state.busyWith(AuthSubmission.SendingCode),
        )
    }
}

/**
 * Sign-up, step 1 — the identifier (036 FR-026, FR-027).
 *
 * ⚠ IT ASKS FOR AN EMAIL AND NOTHING ELSE. First name and Last name used to sit ABOVE the email
 * field, so the very first thing a stranger was asked for was personal data, before they had any
 * reason to trust the form. The name is now the LAST step (FR-032), asked once the account exists.
 */
@Composable
private fun SignUpScreen(container: AppContainer, vm: AuthViewModel) {
    val state by vm.state.collectAsState()
    var email by remember { mutableStateOf("") }
    AuthScaffold(
        title = "Create your account",
        subtitle = "Start with your email — we’ll do the rest in a moment.",
        state = state,
        bottomBar = {
            EffyInlineLink("Already have an account?", "Sign in", onClick = {
                container.navigator.push(CustomerNavKey.SignIn())
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
        TermsNotice()
        EffyPrimaryButton(
            "Email me a code",
            onClick = { vm.registerPasswordless(email) },
            enabled = !state.loading && email.isNotBlank(),
            loading = state.busyWith(AuthSubmission.SendingCode),
        )
        EffyOrDivider()
        GoogleSignInButton(enabled = !state.loading, onUnavailable = { vm.showGoogleUnavailable() })
        EffySecondaryButton(
            "Set a password instead",
            onClick = {
                container.navigator.push(CustomerNavKey.SignUpPassword(email.trim().lowercase()))
            },
            enabled = !state.loading && email.isNotBlank(),
        )
    }
}

/**
 * Sign-up, step 2 — the password (036 FR-028 … FR-030).
 *
 * ⚠ ONE password field, with a reveal toggle, and NO "confirm password". 012's FR-023 forbids a
 * re-typed confirmation — the reveal replaces it, which is GOV.UK's published reasoning and what the
 * account page already does. Web sign-up was the surface still asking twice; this one never did.
 */
@Composable
private fun SignUpPasswordScreen(
    container: AppContainer,
    vm: AuthViewModel,
    route: CustomerNavKey.SignUpPassword,
) {
    val state by vm.state.collectAsState()
    var password by remember { mutableStateOf("") }
    AuthScaffold(
        title = "Choose a password",
        subtitle = "Creating an account for ${route.email}.",
        state = state,
        bottomBar = {
            TermsNotice()
            EffyPrimaryButton(
                "Create account",
                onClick = { vm.registerWithPassword(route.email, password) },
                enabled = !state.loading && password.isNotBlank(),
                loading = state.busyWith(AuthSubmission.Registering),
            )
            EffySecondaryButton(
                "Email me a code instead",
                onClick = { vm.registerPasswordless(route.email) },
                enabled = !state.loading,
                loading = state.busyWith(AuthSubmission.SendingCode),
            )
        },
    ) {
        // ⚠ The rule is stated BEFORE they type, and it is the rule the platform actually enforces
        // (FR-029). No composition rules — current NIST guidance is that they are actively harmful.
        EffyPasswordField(
            "Password",
            password,
            { password = it },
            placeholder = "At least $PASSWORD_MIN_LENGTH characters",
        )
        Text(
            "At least $PASSWORD_MIN_LENGTH characters. Use anything you like — no special characters required.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * The LAST step of registration, on every route (036 FR-032 … FR-035a).
 *
 * ⚠ THE ACCOUNT ALREADY EXISTS AND THE SHOPPER IS ALREADY SIGNED IN by the time this renders. The
 * step completes a profile; it does not gate access. Abandoning it must never lock anyone out — they
 * are simply asked again next time, with nothing on screen suggesting the account is broken.
 *
 * ⚠ Unlike web, the record is GUARANTEED to exist here: `SessionState.Authenticated` is unreachable
 * on mobile without a successful `GET /customer/v1/me`, so there is no read-before-write hazard.
 */
@Composable
private fun ProfileNameScreen(container: AppContainer, vm: AuthViewModel) {
    val state by vm.state.collectAsState()
    var given by remember { mutableStateOf("") }
    var family by remember { mutableStateOf("") }
    AuthScaffold(
        title = "What should we call you?",
        subtitle = "We’ll use this when we say hello and when we hand over your order.",
        state = state,
        bottomBar = {
            EffyPrimaryButton(
                "Finish",
                onClick = { vm.saveName(given, family) },
                enabled = !state.loading && given.isNotBlank() && family.isNotBlank(),
                loading = state.busyWith(AuthSubmission.SavingName),
            )
        },
    ) {
        EffyField("First name", given, { given = it }, placeholder = "Enter your first name")
        EffyField("Last name", family, { family = it }, placeholder = "Enter your last name")
    }
}

/**
 * The one-time-code step — shared by sign-in and sign-up confirmation (036 US1).
 *
 * ⚠ WHAT THIS SCREEN USED TO BE: a bare field and a "Continue" button. It did not say which address
 * the code went to, it offered NO way to send another, and it had no countdown — while its own error
 * copy told the shopper to "Ask for a new one", an instruction the screen provided no control for.
 * A shopper whose email was slow had no recovery at all except abandoning the flow.
 */
@Composable
private fun VerifyOtpScreen(container: AppContainer, vm: AuthViewModel, route: CustomerNavKey.VerifyOtp) {
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }

    // ⚠ The attempt is over — a STEP, not a toast. The Cognito session really is finished, so leaving
    // a form that still looks usable would invite typing into nothing (FR-013).
    if (state.exhausted) {
        AuthScaffold(
            title = "Let’s start that again",
            subtitle = "That code can’t be used any more. We’ll send you a fresh one.",
            state = state,
            bottomBar = {
                EffyPrimaryButton(
                    "Send a new code",
                    onClick = { code = ""; vm.resendCode(route.purpose) },
                    enabled = !state.loading,
                    loading = state.busyWith(AuthSubmission.ResendingCode),
                )
            },
        ) {}
        return
    }

    AuthScaffold(
        title = "Enter your code",
        // ⚠ FR-006 — the address, at last. `AuthStep.NeedsOtp` has always carried it and the ViewModel
        // used to discard it, so the screen could not say where to look.
        subtitle = "We sent a code to ${state.maskedDestination ?: state.email}. " +
            "The code works for 5 minutes.",
        state = state,
        bottomBar = {
            EffyPrimaryButton(
                // ⚠ Pinned to the BOTTOM of the screen, in the thumb's reach and above the keyboard —
                // this screen has exactly one committing action, and inline it floated mid-page on a
                // tall device while the rest of the screen sat empty.
                if (route.purpose == OtpPurpose.SIGN_UP) "Create account" else "Sign in",
                onClick = { vm.submitOtp(route, code) },
                loading = state.busyWith(AuthSubmission.ConfirmingCode),
                // ⚠ `isCompleteOtp`, not `isNotBlank`. Exactly six digits, so a longer paste leaves
                // the button inactive and VISIBLE rather than submitting a reshaped value (FR-004,
                // FR-005). ⚠ And there is deliberately NO auto-submit: codes die after three
                // attempts, and a mistyped last digit that submitted itself would spend one the
                // shopper never chose to.
                enabled = !state.loading && isCompleteOtp(code),
            )
            EffySecondaryButton(
                "Wrong email? Change it",
                onClick = { container.navigator.pop() },
                enabled = !state.loading,
            )
        },
    ) {
        // ⚠ 035 — the SHARED OtpInput. On iOS this is a native UITextField with
        // `UITextContentTypeOneTimeCode`, which is what makes the OS offer the code from Mail.
        // ⚠ 036 — `Cells` draws six visible positions behind ONE field, and `isError` is finally
        // PASSED: the parameter existed and this screen never used it, so the red border and the error
        // semantics were dead code here.
        OtpInput(
            value = code,
            onValueChange = { code = it },
            onSubmit = { if (isCompleteOtp(code)) vm.submitOtp(route, code) },
            enabled = !state.loading,
            isError = state.error != null || code.length > OTP_LENGTH,
            variant = OtpVariant.Cells,
        )
        if (code.length > OTP_LENGTH) {
            // ⚠ FR-004 — a longer paste is KEPT and shown, never reshaped into six submittable digits.
            Text(
                "That’s ${code.length} digits. An Effy code is always $OTP_LENGTH.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        ResendControl(state = state, onResend = { vm.resendCode(route.purpose) })
    }
}

/**
 * The terms notice shown wherever an account is actually created (036 FR-047).
 *
 * ⚠ IT SITS ABOVE THE BUTTON, NOT BELOW IT. Below is the commoner convention, but this button is
 * pinned to the bottom of the screen — so below it would be the last thing pushed off-screen or under
 * the keyboard, and "reasonably conspicuous notice" is precisely the limb that inquiry-notice
 * contracts fail on (*Berman v. Freedom Financial*, 9th Cir. 2022, where the terms were "tiny gray
 * font"). Above the action it is always visible at the moment of assent.
 *
 * ⚠ IT NAMES TWO DOCUMENTS, NOT THREE. The familiar "Terms, Privacy Policy and Cookie Use" string is
 * a US framing: cookie/tracking consent requires a prior affirmative act under ePrivacy and cannot
 * ride on a passive sentence, so bundling it here would be non-compliant in the EU/UK. Terms are
 * "agreed"; a privacy policy is "acknowledged" — it is a notice, not a thing one consents to.
 *
 * ⚠ FULL-CONTRAST TEXT, deliberately not `onSurfaceVariant`. Small size COMBINED with low contrast is
 * the exact failure a court criticised, and the muted step is the tempting choice on a neutral ramp.
 *
 * ⚠ NOT TAPPABLE ON MOBILE YET, AND THAT IS RECORDED RATHER THAN FAKED. There is no legal screen in
 * this app and no storefront base URL in its build config — `requiredKeys` carries the two API hosts
 * and nothing else, so adding one would fail every existing build until each developer updated their
 * `secrets.properties`. The documents are named so the notice is honest; wiring the links needs the
 * config key (or in-app legal routes) and is its own small task. Web links to the real routes.
 */
@Composable
private fun TermsNotice() {
    Text(
        "By continuing you agree to Effy's Terms of Service and acknowledge our Privacy Policy.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurface,
    )
}

/**
 * The resend control and its countdown (036 FR-007 … FR-009).
 *
 * ⚠ THE CEILING IS NOT DECORATION. The platform allows five sends per address per clock hour, and the
 * SIXTH is refused while STILL returning a normal challenge carrying a masked destination — so
 * without this the screen would cheerfully announce a code that was never sent, and the shopper would
 * find out only after burning three guesses.
 *
 * ⚠ THIS IS THE ONLY LINE UNDER THE INPUT. It used to be two: the countdown, plus a permanent "Still
 * not arriving? Email hello@effyshopping.com" support note (037 FR-030a). The note is removed by
 * operator direction — one recovery affordance in the flow, not a second one competing with the resend
 * the shopper is already being asked to wait for. Nothing about the enumeration reasoning it carried
 * has changed: this screen still says nothing about whether an address is deliverable or known, which
 * is the property that mattered.
 */
@Composable
private fun ResendControl(state: AuthUiState, onResend: () -> Unit) {
    // ⚠ The SAME verdict the ViewModel acts on. Re-deriving "is the ceiling reached?" in the view is
    // how a screen ends up offering a control its handler will refuse.
    when (resendVerdict(state.sendsThisFlow, state.resendRemaining, state.loading)) {
        ResendVerdict.Ceiling ->
            Text(
                "We can’t send another code to this address right now. " +
                    "Check your spam folder, or try again later.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        ResendVerdict.Cooldown ->
            Text(
                "Send another code in ${state.resendRemaining}s",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        // ⚠ A TEXT ACTION, NOT A BORDERED BUTTON. Resending is a recovery affordance, not a route
        // through the flow — giving it the same weight as "Use a password instead" made two very
        // different things look equally likely, and put a second full-width bordered control directly
        // above the committing action. `EffyInlineLink` still carries the 48 dp touch target and an
        // underline, which is what makes it legible as an action on a palette with no brand hue.
        // ⚠ `Busy` renders the SAME control, inert — not a different one. A request in flight is a
        // reason not to accept a second tap, not a reason for the affordance to appear or vanish; a row
        // that swaps its content while the shopper waits is what made submitting a code look like it
        // had reset the resend clock.
        ResendVerdict.Allowed, ResendVerdict.Busy ->
            EffyInlineLink(
                "Didn’t get it?",
                "Send another code",
                onClick = onResend,
                enabled = !state.loading,
            )
    }
}

/**
 * "Continue with Google" (036 FR-038 … FR-040).
 *
 * ⚠ THIS SURFACE HAS NEVER HAD A GOOGLE BUTTON. The source design's Google+Facebook row was replaced
 * wholesale by the OTP button, so customer-mobile offered no federated route at all — while web at
 * least had one behind a flag.
 *
 * ⚠ It calls NOTHING. Google is parked (`customer_google_enabled = false`), there is no hosted domain
 * to redirect to, and a real `signInWithWebUI` would fail with a generic error — which is exactly what
 * FR-039 forbids. Nothing went wrong; the capability is not built yet, and saying so is the feature.
 *
 * ⚠ THE MARK MUST NEVER BE RECOLOURED. Google's guidelines: "you can't change the size or color of
 * the Google 'G' logo. It must be the standard color version." So it is drawn from the authored asset
 * at `packages/design-system/mobile-assets/drawable/ic_google_g.xml` with NO tint applied — a tint
 * here would be a licence breach, not a style choice. It is also `null`-described: Google forbids the
 * icon appearing without accompanying text, so the label carries the accessible name.
 *
 * ⚠ This is the constitution's own named exception to the monochrome rule — "an asset, not a token".
 * No token is added and `tokens:check` is unaffected.
 */
@Composable
private fun GoogleSignInButton(enabled: Boolean, onUnavailable: () -> Unit) {
    EffySecondaryButton(
        "Continue with Google",
        onClick = onUnavailable,
        enabled = enabled,
        leading = {
            Image(
                painter = painterResource(Res.drawable.ic_google_g),
                // ⚠ Decorative: the button's own label is the accessible name.
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
        },
    )
}

/** Which part of recovery the shopper is on. */
private enum class RecoveryStep { Email, Code, Password }

/**
 * Password recovery, as THREE steps (036 FR-048).
 *
 * ⚠ THE CODE IS COLLECTED AT STEP 2 AND SPENT AT STEP 3 — it is not verified in between, and that is
 * a requirement rather than a shortcut. 012's FR-022b makes recovery finish at the BACKEND, with the
 * code and the new password travelling in ONE request, because a separate "verify the code" call
 * would create a *"you may now set a password"* state that is worth stealing. So step 2 holds the
 * code and moves on; if it was wrong, the refusal arrives when the password is submitted.
 *
 * That is a real cost — the shopper learns of a mistyped code one screen later than they would like —
 * and it is the same shape the signed-in password flow already uses (`PasswordScreens`' INTRO → CODE
 * → PASSWORD). Splitting it into three screens is what the operator asked for and what makes each
 * step a single decision; verifying the code separately is what security forbids.
 */
@Composable
private fun RecoveryScreen(container: AppContainer, vm: AuthViewModel) {
    val state by vm.state.collectAsState()
    var step by rememberSaveable { mutableStateOf(RecoveryStep.Email) }
    var email by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }

    when (step) {
        RecoveryStep.Email -> AuthScaffold(
            title = "Reset your password",
            subtitle = "Enter your email and we’ll send you a code.",
            state = state,
            bottomBar = {
                EffyPrimaryButton(
                    "Send code",
                    onClick = {
                        vm.sendRecoveryCode(email)
                        step = RecoveryStep.Code
                    },
                    enabled = !state.loading && email.isNotBlank(),
                    loading = state.busyWith(AuthSubmission.SendingCode),
                )
            },
        ) {
            EffyField(
                "Email",
                email,
                { email = it },
                placeholder = "Enter your email address",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            )
        }

        RecoveryStep.Code -> AuthScaffold(
            title = "Enter your code",
            subtitle = "We sent a code to ${state.email.ifBlank { email }}. " +
                "The code works for 5 minutes.",
            state = state,
            bottomBar = {
                EffyPrimaryButton(
                    "Continue",
                    onClick = { step = RecoveryStep.Password },
                    // ⚠ Exactly six digits — a longer paste is kept and refused, never reshaped.
                    enabled = !state.loading && isCompleteOtp(code),
                )
                EffySecondaryButton(
                    "Wrong email? Change it",
                    onClick = { step = RecoveryStep.Email },
                    enabled = !state.loading,
                )
            },
        ) {
            OtpInput(
                value = code,
                onValueChange = { code = it },
                onSubmit = { if (isCompleteOtp(code)) step = RecoveryStep.Password },
                enabled = !state.loading,
                isError = state.error != null || code.length > OTP_LENGTH,
                variant = OtpVariant.Cells,
            )
            ResendControl(state = state, onResend = { vm.sendRecoveryCode(email) })
        }

        RecoveryStep.Password -> AuthScaffold(
            title = "Choose a new password",
            subtitle = "Almost done — pick something you’ll remember.",
            state = state,
            bottomBar = {
                EffyPrimaryButton(
                    "Reset password",
                    // ⚠ HERE is where the code is spent, alongside the password, in one request.
                    onClick = { vm.confirmRecovery(email, code, newPassword) },
                    enabled = !state.loading && newPassword.length >= PASSWORD_MIN_LENGTH,
                    loading = state.busyWith(AuthSubmission.ResettingPassword),
                )
            },
        ) {
            EffyPasswordField(
                "New password",
                newPassword,
                { newPassword = it },
                placeholder = "At least $PASSWORD_MIN_LENGTH characters",
            )
            Text(
                "At least $PASSWORD_MIN_LENGTH characters. Use anything you like — no special characters required.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

