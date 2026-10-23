package com.effyshopping.driver.mobile.features.auth.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.presentation.DriverTextField
import com.effyshopping.driver.mobile.core.presentation.DriverWordmark
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_chevron_left
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_lock
import com.effyshopping.mobile.kit.ui.OtpInput

/**
 * Sign in (canvas `Auth`, `Auth-Code`, `Auth-Error`): work email, then a six-digit code. No password,
 * no self sign-up — driver accounts are set up by a manager.
 */
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
    @Suppress("UNUSED_PARAMETER") reducedMotion: Boolean = false,
    otpInputOverride: (@Composable () -> Unit)? = null,
) {
    BackHandler(enabled = state.stage == AuthStage.Code && !state.isBusy) { onBack() }
    val code = state.stage == AuthStage.Code
    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
        Box(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 4.dp)) {
            if (code) {
                Box(
                    Modifier.size(DriverSize.target).clip(CircleShape).clickable(enabled = !state.isBusy, role = Role.Button) { onDifferentEmail() }
                        .semantics { contentDescription = "Back to email" },
                    contentAlignment = Alignment.Center,
                ) { DriverIcon(Res.drawable.lucide_chevron_left, size = 26.dp, tint = MaterialTheme.colorScheme.primary) }
            }
            DriverWordmark(Modifier.align(Alignment.CenterEnd).padding(end = 20.dp, top = 16.dp), size = 24.sp)
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).widthIn(max = 480.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Column(Modifier.padding(top = 40.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (code) "Enter your code" else "Sign in to Effy Driver",
                    fontSize = 32.sp, lineHeight = 38.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    if (code) "We sent a 6-digit code to ${state.maskedDestination ?: "your work email"}. It works for a few minutes."
                    else "Use your work email. We'll email you a 6-digit code — there's no password.",
                    style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (code) CodeStage(state, onCodeChange, onPrimaryAction, onResend, onDifferentEmail, otpInputOverride)
            else EmailStage(state, onEmailChange, onPrimaryAction)
        }
        Column(
            Modifier.fillMaxWidth().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (!code) {
                Text(
                    "No account? Driver accounts are set up by your manager.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
            // The uniform escape hatch: shown to everyone, always — never conditional on
            // whether the address exists, which would make this line an account-enumeration oracle.
            Text(
                "Code not arriving? Email hello@effyshopping.com",
                style = MaterialTheme.typography.bodySmall,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.testTag("auth_stuck_note"),
            )
        }
    }
}

@Composable
private fun EmailStage(state: AuthUiState, onEmailChange: (String) -> Unit, onSubmit: () -> Unit) {
    val problem = state.fieldError.takeIf { it == AuthFieldError.InvalidEmail }?.let { "Enter a valid work email." }
    state.message?.takeIf { problem == null }?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
    DriverTextField(
        value = state.emailInput,
        onValueChange = onEmailChange,
        label = "Work email",
        placeholder = "you@effyshopping.com",
        enabled = !state.isBusy,
        problem = problem,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Go),
    )
    DriverButton(
        "Email me a code",
        onClick = onSubmit,
        enabled = state.canSubmit,
        loading = state.submission == AuthSubmission.SendingCode,
        modifier = Modifier.fillMaxWidth().testTag("auth_primary_action"),
    )
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
        AuthFieldError.ExpiredCode -> "That code has expired. Send another code."
        // A locked-out driver is told what can still work, not to "try again".
        AuthFieldError.LockedOut -> "Too many attempts. For your security this code is locked — send another, or call dispatch if it keeps happening."
        else -> null
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Your code", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
        if (otpInputOverride != null) {
            otpInputOverride()
        } else {
            OtpInput(
                value = state.codeInput,
                onValueChange = onCodeChange,
                onSubmit = onSubmit,
                enabled = !state.isBusy,
                isError = codeError != null,
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            )
        }
        val shown = codeError ?: state.message
        if (shown != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                DriverIcon(Res.drawable.lucide_circle_alert, size = 14.dp)
                Text(shown, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium))
            }
        } else {
            Text("That's ${state.codeInput.count { it.isDigit() }} of 6 digits.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    DriverButton(
        "Sign in",
        onClick = onSubmit,
        enabled = state.canSubmit,
        loading = state.submission == AuthSubmission.ConfirmingCode,
        modifier = Modifier.fillMaxWidth().testTag("auth_primary_action"),
    )
    DriverButton(
        if (state.resendRemainingSeconds > 0) "Didn't get it? Send another code in ${state.resendRemainingSeconds}s" else "Didn't get it? Send another code",
        onClick = onResend,
        enabled = state.canResend,
        style = DriverButtonStyle.Ghost,
        tall = false,
        modifier = Modifier.fillMaxWidth(),
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Text("Wrong email? ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            "Change it",
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .clickable(enabled = !state.isBusy, role = Role.Button, onClick = onDifferentEmail)
                .padding(vertical = 12.dp)
                .testTag("auth_different_email"),
        )
    }
}

/** A driver account that is switched off or not set up (canvas `Auth-Refused`). */
@Composable
fun RefusedScreen(onSignOut: () -> Unit) {
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        DriverWordmark(Modifier.padding(top = 16.dp, bottom = 12.dp))
        DriverAlert(
            DriverAlertKind.Problem, Res.drawable.lucide_circle_alert,
            title = "This account can't be used",
            description = "Your driver account is switched off or not set up yet. If you think this is a mistake, talk to your manager.",
        )
        Box(Modifier.weight(1f))
        DriverButton("Sign out", onClick = onSignOut, style = DriverButtonStyle.Outline, modifier = Modifier.fillMaxWidth())
    }
}
