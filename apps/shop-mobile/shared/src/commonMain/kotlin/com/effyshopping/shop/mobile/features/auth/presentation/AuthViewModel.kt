package com.effyshopping.shop.mobile.features.auth.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.shop.mobile.core.auth.AuthError
import com.effyshopping.shop.mobile.core.auth.AuthStep
import com.effyshopping.shop.mobile.core.session.SessionManager
import com.effyshopping.shop.mobile.features.auth.domain.ConfirmSignIn
import com.effyshopping.shop.mobile.features.auth.domain.RequestSignInCode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class AuthStage { Email, Code }

enum class AuthSubmission { Idle, SendingCode, ConfirmingCode, ResendingCode }

enum class AuthFieldError { InvalidEmail, MissingCode, InvalidCode, ExpiredCode }

data class AuthUiState(
    val stage: AuthStage = AuthStage.Email,
    val emailInput: String = "",
    val codeInput: String = "",
    val maskedDestination: String? = null,
    val submission: AuthSubmission = AuthSubmission.Idle,
    val fieldError: AuthFieldError? = null,
    val message: String? = null,
    val resendRemainingSeconds: Int = 0,
) {
    val canSubmit: Boolean
        get() = submission == AuthSubmission.Idle && when (stage) {
            AuthStage.Email -> emailInput.trim().isNotEmpty()
            AuthStage.Code -> codeInput.length == OTP_LENGTH
        }

    val canResend: Boolean
        get() = stage == AuthStage.Code && submission == AuthSubmission.Idle && resendRemainingSeconds == 0

    val isBusy: Boolean get() = submission != AuthSubmission.Idle
}

/**
 * Presentation state for the one public credential journey. All methods are duplicate-safe and keep
 * recoverable input in state; SDK exception text and raw credentials never become presentation messages.
 */
class AuthViewModel(
    private val requestSignInCode: RequestSignInCode,
    private val confirmSignIn: ConfirmSignIn,
    private val session: SessionManager,
    private val resendCooldownSeconds: Int = DEFAULT_RESEND_COOLDOWN_SECONDS,
    private val coroutineScope: CoroutineScope? = null,
) : ViewModel() {
    private val mutableState = MutableStateFlow(AuthUiState())
    val state = mutableState.asStateFlow()

    private val scope: CoroutineScope get() = coroutineScope ?: viewModelScope

    fun onEmailChange(value: String) {
        if (mutableState.value.isBusy) return
        mutableState.value = mutableState.value.copy(
            emailInput = value,
            fieldError = null,
            message = null,
        )
    }

    fun onCodeChange(value: String) {
        if (mutableState.value.isBusy) return
        mutableState.value = mutableState.value.copy(
            codeInput = normalizeOtp(value),
            fieldError = null,
            message = null,
        )
    }

    fun sendCode() {
        val snapshot = mutableState.value
        if (snapshot.isBusy) return
        val normalizedEmail = snapshot.emailInput.trim()
        if (!isValidEmail(normalizedEmail)) {
            mutableState.value = snapshot.copy(fieldError = AuthFieldError.InvalidEmail, message = null)
            return
        }

        mutableState.value = snapshot.copy(
            emailInput = normalizedEmail,
            submission = AuthSubmission.SendingCode,
            fieldError = null,
            message = null,
        )
        scope.launch {
            when (val result = requestSignInCode(normalizedEmail)) {
                is AuthStep.NeedsOtp -> enterCodeStage(result.destination)
                is AuthStep.Done -> completeSignIn()
                is AuthStep.Failed -> finishWith(result.error)
            }
        }
    }

    fun submitCode() {
        val snapshot = mutableState.value
        if (snapshot.isBusy || snapshot.stage != AuthStage.Code) return
        val normalizedCode = normalizeOtp(snapshot.codeInput)
        if (normalizedCode.length != OTP_LENGTH) {
            mutableState.value = snapshot.copy(
                codeInput = normalizedCode,
                fieldError = AuthFieldError.MissingCode,
                message = null,
            )
            return
        }

        mutableState.value = snapshot.copy(
            codeInput = normalizedCode,
            submission = AuthSubmission.ConfirmingCode,
            fieldError = null,
            message = null,
        )
        scope.launch {
            when (val result = confirmSignIn(normalizedCode)) {
                is AuthStep.Done -> completeSignIn()
                is AuthStep.Failed -> finishWith(result.error)
                is AuthStep.NeedsOtp -> finishWith(AuthError.CodeIncorrect)
            }
        }
    }

    fun resendCode() {
        val snapshot = mutableState.value
        if (!snapshot.canResend) return
        mutableState.value = snapshot.copy(
            submission = AuthSubmission.ResendingCode,
            fieldError = null,
            message = null,
        )
        scope.launch {
            when (val result = requestSignInCode(snapshot.emailInput.trim())) {
                is AuthStep.NeedsOtp -> enterCodeStage(result.destination)
                is AuthStep.Done -> completeSignIn()
                is AuthStep.Failed -> finishWith(result.error)
            }
        }
    }

    /** Returns true when the event was consumed by the auth flow. */
    fun onBack(): Boolean {
        val snapshot = mutableState.value
        if (snapshot.stage != AuthStage.Code || snapshot.isBusy) return false
        backToEmail()
        return true
    }

    fun backToEmail() {
        if (mutableState.value.isBusy) return
        mutableState.value = mutableState.value.copy(
            stage = AuthStage.Email,
            codeInput = "",
            maskedDestination = null,
            fieldError = null,
            message = null,
            resendRemainingSeconds = 0,
        )
    }

    private suspend fun completeSignIn() {
        mutableState.value = mutableState.value.copy(submission = AuthSubmission.Idle)
        session.onSignedIn()
    }

    private fun enterCodeStage(destination: String) {
        mutableState.value = mutableState.value.copy(
            stage = AuthStage.Code,
            codeInput = "",
            maskedDestination = maskEmail(destination),
            submission = AuthSubmission.Idle,
            fieldError = null,
            message = null,
            resendRemainingSeconds = resendCooldownSeconds,
        )
        startResendCountdown()
    }

    private fun startResendCountdown() {
        if (resendCooldownSeconds <= 0) return
        scope.launch {
            while (mutableState.value.stage == AuthStage.Code && mutableState.value.resendRemainingSeconds > 0) {
                delay(1_000)
                val current = mutableState.value
                if (current.stage == AuthStage.Code && current.resendRemainingSeconds > 0) {
                    mutableState.value = current.copy(resendRemainingSeconds = current.resendRemainingSeconds - 1)
                }
            }
        }
    }

    private fun finishWith(error: AuthError) {
        val (fieldError, message) = errorPresentation(error)
        mutableState.value = mutableState.value.copy(
            submission = AuthSubmission.Idle,
            fieldError = fieldError,
            message = message,
        )
    }
}

internal const val OTP_LENGTH = 6
private const val DEFAULT_RESEND_COOLDOWN_SECONDS = 30

internal fun normalizeOtp(value: String): String = value.filter(Char::isDigit).take(OTP_LENGTH)

internal fun isValidEmail(value: String): Boolean {
    val at = value.indexOf('@')
    val dot = value.lastIndexOf('.')
    return at > 0 && dot > at + 1 && dot < value.lastIndex && !value.any(Char::isWhitespace)
}

internal fun maskEmail(value: String): String {
    val email = value.trim()
    val at = email.indexOf('@')
    if (at <= 0 || at == email.lastIndex) return "your work email"
    val local = email.substring(0, at)
    val domain = email.substring(at + 1)
    val visible = local.take(1)
    return "$visible${"•".repeat((local.length - 1).coerceIn(2, 5))}@$domain"
}

private fun errorPresentation(error: AuthError): Pair<AuthFieldError?, String> = when (error) {
    AuthError.InvalidCredentials -> null to "We couldn't sign you in. Check your email and try again."
    AuthError.CodeIncorrect -> AuthFieldError.InvalidCode to "That code isn't right. Check it and try again."
    AuthError.CodeExpired -> AuthFieldError.ExpiredCode to "That code has expired. Request a new one."
    is AuthError.RateLimited -> null to "Too many attempts. Please wait a little and try again."
    AuthError.Network -> null to "You're offline. Check your connection and try again."
    AuthError.Unavailable -> null to "Sign in is unavailable right now. Try again shortly."
    AuthError.Unexpected -> null to "Something went wrong. Try again."
}
