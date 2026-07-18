package com.effyshopping.shop.mobile.features.auth.presentation

import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.ui.EffyMotion
import com.effyshopping.mobile.kit.ui.MotionLevel
import com.effyshopping.mobile.kit.ui.MotionRole
import com.effyshopping.shop.mobile.core.ui.EffyInlineError
import com.effyshopping.shop.mobile.core.ui.EffyPage
import com.effyshopping.shop.mobile.core.ui.EffyPrimaryAction
import com.effyshopping.shop.mobile.core.ui.EffyTextAction
import com.effyshopping.shop.mobile.core.ui.EffyTextField
import com.effyshopping.shop.mobile.design.EffySpacing

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun SignInScreen(
    state: AuthUiState,
    onEmailChange: (String) -> Unit,
    onCodeChange: (String) -> Unit,
    onPrimaryAction: () -> Unit,
    onResend: () -> Unit,
    onDifferentEmail: () -> Unit,
    onBack: () -> Boolean,
    reducedMotion: Boolean = false,
    otpInputOverride: (@Composable () -> Unit)? = null,
) {
    BackHandler(enabled = state.stage == AuthStage.Code && !state.isBusy) { onBack() }
    val focus = LocalFocusManager.current
    val motionLevel = if (reducedMotion) MotionLevel.Reduced else MotionLevel.Full
    val motion = EffyMotion.spec(MotionRole.Forward, motionLevel)

    EffyPage {
        Column(
            modifier = Modifier.fillMaxWidth().widthIn(max = 560.dp).align(Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
        ) {
            Column(
                modifier = Modifier.padding(top = EffySpacing.xxxl),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
            ) {
                Text(
                    "EFFY",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    "Shop workspace",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            AnimatedContent(
                targetState = state.stage,
                transitionSpec = {
                    if (motionLevel == MotionLevel.Reduced) {
                        fadeIn(tween(EffyMotion.FastMillis)) togetherWith fadeOut(tween(EffyMotion.FastMillis))
                    } else {
                        val forward = targetState == AuthStage.Code
                        (fadeIn(tween(motion.durationMillis)) + slideInHorizontally(tween(motion.durationMillis)) {
                            if (forward) it / 8 else -it / 8
                        }) togetherWith
                            (fadeOut(tween(motion.durationMillis)) + slideOutHorizontally(tween(motion.durationMillis)) {
                                if (forward) -it / 12 else it / 12
                            })
                    }
                },
                contentKey = { it },
            ) { stage ->
                when (stage) {
                    AuthStage.Email -> EmailStage(
                        state = state,
                        onEmailChange = onEmailChange,
                        onSubmit = onPrimaryAction,
                        onNextFocus = { focus.moveFocus(FocusDirection.Down) },
                    )
                    AuthStage.Code -> CodeStage(
                        state = state,
                        onCodeChange = onCodeChange,
                        onSubmit = onPrimaryAction,
                        onResend = onResend,
                        onDifferentEmail = onDifferentEmail,
                        otpInputOverride = otpInputOverride,
                    )
                }
            }
        }
    }
}

@Composable
private fun EmailStage(
    state: AuthUiState,
    onEmailChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onNextFocus: () -> Unit,
) {
    AuthStageLayout(
        title = "Welcome back",
        description = "Use your work email to receive a one-time sign-in code.",
        error = state.fieldError.takeIf { it == AuthFieldError.InvalidEmail }?.let { "Enter a valid work email." }
            ?: state.message,
    ) {
        EffyTextField(
            value = state.emailInput,
            onValueChange = onEmailChange,
            label = "Work email",
            enabled = !state.isBusy,
            isError = state.fieldError == AuthFieldError.InvalidEmail,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { onNextFocus() }),
        )
        EffyPrimaryAction(
            label = "Send code",
            onClick = onSubmit,
            enabled = state.canSubmit,
            loading = state.submission == AuthSubmission.SendingCode,
            modifier = Modifier.testTag("auth_primary_action"),
        )
        Text(
            "Passwordless access for provisioned shop operators.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CodeStage(
    state: AuthUiState,
    onCodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onResend: () -> Unit,
    onDifferentEmail: () -> Unit,
    otpInputOverride: (@Composable () -> Unit)?,
) {
    val codeError = when (state.fieldError) {
        AuthFieldError.MissingCode -> "Enter the complete 6-digit code."
        AuthFieldError.InvalidCode -> "That code isn't right. Check it and try again."
        AuthFieldError.ExpiredCode -> "That code has expired. Request a new one."
        else -> null
    }
    AuthStageLayout(
        title = "Check your email",
        description = "Enter the code sent to ${state.maskedDestination ?: "your work email"}.",
        error = codeError ?: state.message,
    ) {
        if (otpInputOverride != null) {
            otpInputOverride()
        } else {
            OtpInput(
                value = state.codeInput,
                onValueChange = onCodeChange,
                onSubmit = onSubmit,
                enabled = !state.isBusy,
                isError = state.fieldError in setOf(
                    AuthFieldError.MissingCode,
                    AuthFieldError.InvalidCode,
                    AuthFieldError.ExpiredCode,
                ),
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            )
        }
        EffyPrimaryAction(
            label = "Sign in",
            onClick = onSubmit,
            enabled = state.canSubmit,
            loading = state.submission == AuthSubmission.ConfirmingCode,
            modifier = Modifier.testTag("auth_primary_action"),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            EffyTextAction(
                label = if (state.resendRemainingSeconds > 0) {
                    "Resend in ${state.resendRemainingSeconds}s"
                } else {
                    "Resend code"
                },
                onClick = onResend,
                enabled = state.canResend,
            )
            EffyTextAction(
                "Different email",
                onDifferentEmail,
                enabled = !state.isBusy,
                modifier = Modifier.testTag("auth_different_email"),
            )
        }
    }
}

@Composable
private fun AuthStageLayout(
    title: String,
    description: String,
    error: String?,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
        Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Text(title, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
            Text(
                description,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(
            visible = error != null,
            enter = fadeIn(tween(EffyMotion.FastMillis)),
            exit = fadeOut(tween(EffyMotion.FastMillis)),
        ) {
            error?.let { EffyInlineError(it) }
        }
        content()
    }
}
