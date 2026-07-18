package com.effyshopping.shop.mobile.ui

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.effyshopping.shop.mobile.core.theme.EffyTheme
import com.effyshopping.shop.mobile.features.auth.presentation.AuthFieldError
import com.effyshopping.shop.mobile.features.auth.presentation.AuthStage
import com.effyshopping.shop.mobile.features.auth.presentation.AuthSubmission
import com.effyshopping.shop.mobile.features.auth.presentation.AuthUiState
import com.effyshopping.shop.mobile.features.auth.presentation.SignInScreen
import kotlin.test.Test
import kotlin.test.assertEquals

@OptIn(ExperimentalTestApi::class)
class AuthFoundationUiTest {
    @Test
    fun email_state_has_one_primary_action_and_inline_error() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
        setContent {
            EffyTheme {
                SignInScreen(
                    state = AuthUiState(emailInput = "bad", fieldError = AuthFieldError.InvalidEmail),
                    onEmailChange = {},
                    onCodeChange = {},
                    onPrimaryAction = {},
                    onResend = {},
                    onDifferentEmail = {},
                    onBack = { false },
                )
            }
        }
        mainClock.advanceTimeBy(300)
        awaitIdle()
        onNodeWithText("Welcome back").assertExists()
        onNodeWithText("Enter a valid work email.").assertExists()
        onNodeWithText("Send code").assertIsEnabled()
        onNodeWithText("Catalog").assertDoesNotExist()
        }
    }

    @Test
    fun code_state_exposes_one_logical_otp_node_and_busy_actions_are_disabled() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
        setContent {
            EffyTheme {
                SignInScreen(
                    state = AuthUiState(
                        stage = AuthStage.Code,
                        codeInput = "123456",
                        maskedDestination = "o•••••@effy.example",
                        submission = AuthSubmission.ConfirmingCode,
                    ),
                    onEmailChange = {},
                    onCodeChange = {},
                    onPrimaryAction = {},
                    onResend = {},
                    onDifferentEmail = {},
                    onBack = { true },
                    otpInputOverride = {
                        Box(Modifier.height(56.dp).semantics { contentDescription = "One-time code" })
                    },
                )
            }
        }
        mainClock.advanceTimeBy(300)
        awaitIdle()
        assertEquals(1, onAllNodes(hasContentDescription("One-time code")).fetchSemanticsNodes().size)
        onNodeWithTag("auth_primary_action").assertIsNotEnabled()
        onNodeWithTag("auth_different_email").assertIsNotEnabled()
        }
    }
}

internal expect fun canRunComposeUiTestOnHost(): Boolean
