package com.effyshopping.customer.mobile.features.auth.presentation

import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffyWordmark
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
import com.effyshopping.customer.mobile.features.legal.presentation.LegalLinksText
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
import com.effyshopping.customer.mobile.core.presentation.EffyNotice
import com.effyshopping.customer.mobile.resources.lucide_shopping_cart

const val PASSWORD_MIN_LENGTH = 12 // mirrors the platform policy (shared-types PASSWORD_MIN_LENGTH)

/**
 * The auth flow's single observable state. The pending email, seed password and returnTo are in it, so
 * they survive process death and the code step can always say where the code went.
 */
/**
 * Which action is in flight, not merely that one is: screens offer two ("Sign in", "Email me a code
 * instead"), and the spinner belongs in the pressed control.
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
    /** The address in play - shown on the code step so the shopper knows where to look. */
    val email: String = "",
    /** Cognito's masked destination when it gives us one; otherwise the address itself. */
    val maskedDestination: String? = null,
    /** Wrong codes so far in this session. The platform's cap is 3 (`OTP_MAX_ATTEMPTS`). */
    val attemptsUsed: Int = 0,
    /**
     * Codes sent in this flow. The platform allows twenty per address per clock hour and the 21st is
     * refused while still returning a normal-looking challenge - so the shopper would be shown a code
     * screen for an email that does not exist. Counting locally is the only honest defence.
     */
    val sendsThisFlow: Int = 0,
    /** Seconds until "send another code" becomes available. */
    val resendRemaining: Int = 0,
    /** True once the attempt allowance is spent - the session is over, not merely wrong. */
    val exhausted: Boolean = false,
    val seedPassword: Boolean = false,
    val returnTo: CustomerNavKey? = null,
) {
    /** Anything in flight. Kept so every existing `enabled = !state.loading` read still holds. */
    val loading: Boolean get() = submission != AuthSubmission.Idle

    /** Is this control the one that is waiting? */
    fun busyWith(action: AuthSubmission): Boolean = submission == action
}

/**
 * The ceiling, the attempt cap and the cooldown now live in
 * `features/auth/domain/OtpFlowRules.kt` as pure functions - see the note there. They were private
 * consts and inline `if`s in this file, which is why the two rules most likely to strand a shopper
 * had no test on either mobile app.
 */

/**
 * The auth flow. Registration (two routes), sign-in (two routes), OTP confirm, recovery.
 * On a terminal step it drives the [session] and navigates via [navigator]. Errors come from the closed
 * [AuthError] set - `UserNotFound` and `NotAuthorized` are the same message, so the app is never
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
     * The honest refusal for a control that is deliberately not wired.
     *
     * Google is parked: no hosted domain exists, so there is nothing to redirect to. Attempting a real
     * federated sign-in would surface a generic "something went wrong", which is a lie - nothing went
     * wrong, the capability is not built. Saying which is the whole point of shipping the button now.
     */
    fun showGoogleUnavailable() {
        _state.value = _state.value.copy(
            error = "Google sign-in isn’t available yet. " +
                "For now, use your email - we’ll send you a code.",
        )
    }

    /** Clear the visible error/info on entering a step; never the whole state (it holds the email the code went to). */
    fun clearTransient() { _state.value = _state.value.copy(error = null, info = null) }

    /**
     * No name arguments. It is the last step now, asked once the account exists.
     * The address is lowercased as well as trimmed: the platform's per-address rate limit is keyed
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
     * Send another code.
     *
     * The ceiling is checked before the call. Past twenty sends in this flow the platform silently
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
                    // Point at the newest email. Two codes can arrive out of order and the older one
                    // no longer works; a shopper reading top-down has no way to tell which is which.
                    info = "New code sent. Use the most recent email - the older code no longer works.",
                    // A resend starts a new Cognito session, whose attempt list is empty.
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
            // Recovery has its own screen (code + new password, finished at the backend). This
            // branch was an empty `{}` - a declared, serialised, round-trip-tested dead branch. It now
            // says so rather than silently doing nothing when tapped.
            OtpPurpose.RECOVERY ->
                _state.value = _state.value.copy(error = "Use the reset screen to choose a new password.")
        }
    }

    /** The final registration step. Writes the name, then finishes the journey. */
    fun saveName(given: String, family: String) {
        if (given.isBlank() || family.isBlank()) {
            _state.value = _state.value.copy(error = "Please tell us both names.")
            return
        }
        launch(AuthSubmission.SavingName) {
            try {
                // `phone = ""` means "clear", and that is correct here: a brand-new account has no phone,
                // and the backend maps empty→null on the same path the names use. Passing anything else
                // would invent a value the customer never gave.
                updateProfileUseCase(given.trim(), family.trim(), "")
                // Home, and only here. See `finishJourney`.
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

    // plumbing

    /** Lowercased as well as trimmed - the rate-limit key is `HMAC(email)`. */
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
                // After registration the journey is not over: the name is the last step.
                is AuthStep.Done ->
                    if (registration) {
                        session.onSignedIn(before.seedPassword)
                        navigator.push(CustomerNavKey.ProfileName)
                    } else {
                        finishJourney(landOnHome = false)
                    }
                is AuthStep.NeedsOtp -> {
                    // The masked destination is finally kept. Both drivers have always populated it
                    // and this ViewModel threw it away, which is why the code screen could never say
                    // where it had sent anything.
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
                    // A refused code is not a generic failure - it costs one of three attempts, and
                    // the third ends the session rather than merely being wrong.
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
     * Where the shopper lands; return-to-intent is the rule:
     *  • an explicit non-tab-root [AuthUiState.returnTo] (checkout, a product) → push it;
     *  • otherwise → the root of the tab that asked (Orders → orders, Account → their account);
     *  • [landOnHome] → Home, only after a fresh registration (a new customer has nothing on either root).
     * Always `resetToRoot` first, never `resetTo(Home)`, which would set the asking tab's stack to Home for
     * good (`CustomerNavState.resetTo` refuses it).
     */
    private suspend fun finishJourney(landOnHome: Boolean) {
        session.onSignedIn(_state.value.seedPassword)
        val returnTo = _state.value.returnTo
        navigator.resetToRoot()
        when {
            // They were interrupted mid-task - put them back exactly there.
            returnTo != null && returnTo !in CUSTOMER_TAB_ROOTS -> navigator.push(returnTo)
            // They tapped a gated TAB and were asked to sign in instead of being shown a dead gate.
            // Take them to the thing they actually pressed. `resetToRoot` has already
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
     * Route-aware: `NotAuthorizedException` ([AuthError.InvalidCredentials]) is a credential mismatch on the
     * password route but spent attempts on the code route. The code-route wording matches an unknown
     * address's, so the two cannot be told apart.
     */
    private fun message(e: AuthError, passwordRoute: Boolean): String = when (e) {
        AuthError.InvalidCredentials ->
            if (passwordRoute) "That email or password isn't right."
            else "That didn't work. Send a new code and try again."
        // "wasn't accepted", not "is wrong". On the sign-in route the platform genuinely cannot tell
        // a mistyped code from an expired or superseded one - the trigger computes a reason and
        // discards it so the answer cannot be used to discover who has an account.
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

// Screens

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
 * The auth layout, top to bottom: a title, a grey supporting line, the fields, the primary action, an "Or"
 * separator, the federated route, and the opposite journey linked at the bottom. One filled CTA, one
 * bordered alternative, inline links for the rest.
 */
@Composable
private fun AuthScaffold(
    title: String,
    subtitle: String,
    state: AuthUiState,
    /**
     * The screen's bottom group - pinned above the keyboard, in the thumb's reach.
     *
     * Two different things go here, and which one depends on the screen. On a screen with one
     * committing action (the code step, the name step, a password step) it is that action. On a
     * screen offering several routes (sign-in step 1, sign-up step 1) the actions belong with the
     * fields they act on, and this holds only the opposite-journey link - "Don't have an account?
     * Join" - which is genuinely a footer.
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
            // Effy is guest-first, so this is an adaptation of the source and not a copy of it. In
            // the kit the login screen IS the app's root - nothing precedes it, so it needs no way
            // back. Here sign-in is pushed over whatever the shopper was doing, and abandoning it
            // must be possible: without this arrow a guest who tapped Orders was left in the flow
            // with the tab bar hidden. It draws only when there is somewhere to return to.
            EffyBackArrow()

            Spacer(Modifier.height(EffySpacing.lg))

            // Group 1: what this screen is
            // Title and subtitle are one thought, so they sit at the tightest gap on the scale.
            // 087 (Auth boards): the wordmark above a 32sp title.
            EffyWordmark(size = 28.sp)
            Spacer(Modifier.height(EffySpacing.xl))
            Text(title, style = MaterialTheme.typography.headlineLarge)
            Spacer(Modifier.height(EffySpacing.s))
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // The break between groups: 40dp (`EffySpacing.xxxl`) against 16dp (`lg`) inside them, so
            // proximity reads as a boundary. The scale has no 24 or 32 step.
            Spacer(Modifier.height(EffySpacing.xxxl))

            // Group 2: what you do here
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
                content()
                // An error is black with an icon - the storefront has no red.
                state.error?.let { EffyInlineError(it) }
                state.info?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                // No page-level spinner. It used to sit here, loose in the column: it could not say
                // which of two actions was running, and it appeared and disappeared in the layout
                // flow, nudging everything below it. Progress now lives in the pressed button.
            }
        }
    }
}

/**
 * Sign-in, step 1: the identifier. The code is the primary route and the password a step: the address
 * first, then how to prove it.
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
        // 087 (Auth board, from checkout) - a shopper sent here by Checkout is told their cart waits
        // and where they will land. True only because sign-in really does return to checkout
        // (`returnTo`) and the guest cart is merged into the account on sign-in.
        if (returnTo == CustomerNavKey.Checkout) {
            EffyNotice(
                "Your cart is saved - sign in and we'll take you straight back to checkout.",
                icon = Res.drawable.lucide_shopping_cart,
            )
        }
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
        // The source design offers Google and Facebook. Facebook stays dropped - it is not
        // an Effy credential route. Google is offered because the operator asked for the control now
        // and the capability later; tapping it says so plainly rather than failing generically.
        // Shown only when Google sign-in actually works (it is parked; see AppConfig).
        if (AppConfig.googleSignInEnabled) {
            GoogleSignInButton(enabled = !state.loading, onUnavailable = { vm.showGoogleUnavailable() })
        }
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
 * Sign-in, step 2 - the password (036 FR-018 … FR-020).
 *
 * The address is displayed, never asked again: the previous step already has it.
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
        // Reset lives here, on the step where the person who needs it is standing.
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

/** Sign-up, step 1: the email and nothing else. The name is the last step, once the account exists. */
@Composable
private fun SignUpScreen(container: AppContainer, vm: AuthViewModel) {
    val state by vm.state.collectAsState()
    var email by remember { mutableStateOf("") }
    AuthScaffold(
        title = "Create your account",
        subtitle = "Start with your email - we’ll do the rest in a moment.",
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
        TermsNotice(onNavigateLegal = { container.navigator.push(CustomerNavKey.LegalDocument(it)) })
        EffyPrimaryButton(
            "Email me a code",
            onClick = { vm.registerPasswordless(email) },
            enabled = !state.loading && email.isNotBlank(),
            loading = state.busyWith(AuthSubmission.SendingCode),
        )
        EffyOrDivider()
        // Shown only when Google sign-in actually works (it is parked; see AppConfig).
        if (AppConfig.googleSignInEnabled) {
            GoogleSignInButton(enabled = !state.loading, onUnavailable = { vm.showGoogleUnavailable() })
        }
        EffySecondaryButton(
            "Set a password instead",
            onClick = {
                container.navigator.push(CustomerNavKey.SignUpPassword(email.trim().lowercase()))
            },
            enabled = !state.loading && email.isNotBlank(),
        )
    }
}

/** Sign-up, step 2: one password field with a reveal toggle, and no "confirm password" (the reveal replaces it). */
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
            TermsNotice(onNavigateLegal = { container.navigator.push(CustomerNavKey.LegalDocument(it)) })
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
        // The rule is stated before they type, and it is the rule the platform actually enforces.
        // No composition rules - current NIST guidance is that they are actively harmful.
        EffyPasswordField(
            "Password",
            password,
            { password = it },
            placeholder = "At least $PASSWORD_MIN_LENGTH characters",
        )
        Text(
            "At least $PASSWORD_MIN_LENGTH characters. Use anything you like - no special characters required.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * The last step of registration, on every route. The account exists and the shopper is signed in: this
 * completes a profile and never gates access (abandoned, it is asked again next time). The record exists
 * by construction (`SessionState.Authenticated` needs a successful `GET /customer/v1/me`).
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

/** The one-time-code step, shared by sign-in and sign-up confirmation: it says where the code went, with a resend and its countdown. */
@Composable
private fun VerifyOtpScreen(container: AppContainer, vm: AuthViewModel, route: CustomerNavKey.VerifyOtp) {
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }

    // The attempt is over - a step, not a toast. The Cognito session really is finished, so leaving
    // a form that still looks usable would invite typing into nothing.
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
        // The address, at last. `AuthStep.NeedsOtp` has always carried it and the ViewModel
        // used to discard it, so the screen could not say where to look.
        subtitle = "We sent a code to ${state.maskedDestination ?: state.email}. " +
            "The code works for 5 minutes.",
        state = state,
        bottomBar = {
            EffyPrimaryButton(
                // Pinned to the bottom of the screen, in the thumb's reach and above the keyboard
                // this screen has exactly one committing action, and inline it floated mid-page on a
                // tall device while the rest of the screen sat empty.
                if (route.purpose == OtpPurpose.SIGN_UP) "Create account" else "Sign in",
                onClick = { vm.submitOtp(route, code) },
                loading = state.busyWith(AuthSubmission.ConfirmingCode),
                // `isCompleteOtp`, not `isNotBlank`. Exactly six digits, so a longer paste leaves
                // the button inactive and visible rather than submitting a reshaped value (FR-004,
                // FR-005). And there is deliberately NO auto-submit: codes die after three
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
        // The shared OtpInput. On iOS this is a native UITextField with
        // `UITextContentTypeOneTimeCode`, which is what makes the OS offer the code from Mail.
        // `Cells` draws six visible positions behind one field, and `isError` is finally
        // passed: the parameter existed and this screen never used it, so the red border and the error
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
            // A longer paste is kept and shown, never reshaped into six submittable digits.
            EffyInlineError("That’s ${code.length} digits. An Effy code is always $OTP_LENGTH.")
        }

        ResendControl(state = state, onResend = { vm.resendCode(route.purpose) })
    }
}

/**
 * The terms notice shown wherever an account is actually created.
 *
 * It sits above the button, not below it. Below is the commoner convention, but this button is
 * pinned to the bottom of the screen - so below it would be the last thing pushed off-screen or under
 * the keyboard, and "reasonably conspicuous notice" is precisely the limb that inquiry-notice
 * contracts fail on (*Berman v. Freedom Financial*, 9th Cir. 2022, where the terms were "tiny gray
 * font"). Above the action it is always visible at the moment of assent.
 *
 * It names two documents, not three. The familiar "Terms, Privacy Policy and Cookie Use" string is
 * a US framing: cookie/tracking consent requires a prior affirmative act under ePrivacy and cannot
 * ride on a passive sentence, so bundling it here would be non-compliant in the eu/uk. Terms are
 * "agreed"; a privacy policy is "acknowledged" - it is a notice, not a thing one consents to.
 *
 * Full-contrast text, deliberately not `onSurfaceVariant`. Small size combined with low contrast is
 * the exact failure a court criticised, and the muted step is the tempting choice on a neutral ramp.
 *
 * Not tappable on mobile yet, and that is recorded rather than faked. There is no legal screen in
 * this app and no storefront base URL in its build config - `requiredKeys` carries the two API hosts
 * and nothing else, so adding one would fail every existing build until each developer updated their
 * `secrets.properties`. The documents are named so the notice is honest; wiring the links needs the
 * config key (or in-app legal routes) and is its own small task. Web links to the real routes.
 */
@Composable
private fun TermsNotice(onNavigateLegal: (String) -> Unit) {
    // The named documents now link to the real, rendered legal content.
    LegalLinksText(
        "By continuing you agree to our [Terms of Service](/legal/terms-of-service) and acknowledge " +
            "our [Privacy Policy](/legal/privacy-policy).",
        onNavigateSlug = onNavigateLegal,
        color = MaterialTheme.colorScheme.onSurface,
    )
}

/**
 * The resend control and its countdown, the one line under the input. The ceiling matters: twenty sends per
 * address per hour, and the 21st still returns a normal-looking challenge, so without it the screen would
 * announce a code never sent. Nothing here says whether an address is known.
 */
@Composable
private fun ResendControl(state: AuthUiState, onResend: () -> Unit) {
    // The same verdict the ViewModel acts on. Re-deriving "is the ceiling reached?" in the view is
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
        // A text action, not a bordered button. Resending is a recovery affordance, not a route
        // through the flow - giving it the same weight as "Use a password instead" made two very
        // different things look equally likely, and put a second full-width bordered control directly
        // above the committing action. `EffyInlineLink` still carries the 48 dp touch target and an
        // underline, which is what makes it legible as an action on a palette with no brand hue.
        // `Busy` renders the same control, inert - not a different one. A request in flight is a
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
 * "Continue with Google". It calls nothing: Google is parked (`customer_google_enabled = false`, no hosted
 * domain), and the button says so rather than failing with a generic error.
 *
 * The mark is never recoloured (Google's guidelines): drawn from
 * `packages/design-system/mobile-assets/drawable/ic_google_g.xml` with no tint, an asset rather than a
 * token. It has no content description: the label carries the accessible name.
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
                // Decorative: the button's own label is the accessible name.
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
        },
    )
}

/** Which part of recovery the shopper is on. */
private enum class RecoveryStep { Email, Code, Password }

/**
 * Password recovery in three steps. The code is collected at step 2 and spent at step 3, never verified in
 * between: the code and the new password travel in one request, because a separate "verify" call would
 * create a "you may now set a password" state worth stealing. A mistyped code is refused when the password
 * is submitted.
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
                    // Exactly six digits - a longer paste is kept and refused, never reshaped.
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
            subtitle = "Almost done - pick something you’ll remember.",
            state = state,
            bottomBar = {
                EffyPrimaryButton(
                    "Reset password",
                    // Here is where the code is spent, alongside the password, in one request.
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
                "At least $PASSWORD_MIN_LENGTH characters. Use anything you like - no special characters required.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

