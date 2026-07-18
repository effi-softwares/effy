package com.effyshopping.shop.mobile.features.auth.presentation

import com.effyshopping.shop.mobile.core.auth.AuthDriver
import com.effyshopping.shop.mobile.core.auth.AuthError
import com.effyshopping.shop.mobile.core.auth.AuthStep
import com.effyshopping.shop.mobile.core.auth.Session
import com.effyshopping.shop.mobile.core.session.SessionManager
import com.effyshopping.shop.mobile.core.session.SessionState
import com.effyshopping.shop.mobile.features.auth.domain.ConfirmSignIn
import com.effyshopping.shop.mobile.features.auth.domain.RequestSignInCode
import com.effyshopping.shop.mobile.features.shop.domain.AssignedShop
import com.effyshopping.shop.mobile.features.shop.domain.GetOperator
import com.effyshopping.shop.mobile.features.shop.domain.ManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.Operator
import com.effyshopping.shop.mobile.features.shop.domain.OperatorStatus
import com.effyshopping.shop.mobile.features.shop.domain.ShopLifecycle
import com.effyshopping.shop.mobile.features.shop.domain.ShopRepository
import com.effyshopping.shop.mobile.features.shop.domain.ShopRole
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {
    @Test
    fun invalid_email_stays_local_and_valid_request_is_normalized_and_masked() = runTest {
        val driver = FakeAuthDriver()
        val vm = viewModel(driver, this, cooldown = 2)

        vm.onEmailChange("not-an-email")
        vm.sendCode()
        assertEquals(AuthFieldError.InvalidEmail, vm.state.value.fieldError)
        assertEquals(0, driver.requestCount)

        vm.onEmailChange("  operator@effy.example  ")
        driver.requestResult = AuthStep.NeedsOtp("operator@effy.example")
        vm.sendCode()
        runCurrent()

        assertEquals("operator@effy.example", driver.lastEmail)
        assertEquals(AuthStage.Code, vm.state.value.stage)
        assertEquals("o•••••@effy.example", vm.state.value.maskedDestination)
        assertEquals(2, vm.state.value.resendRemainingSeconds)
        assertFalse(vm.state.value.canResend)
        advanceTimeBy(2_001)
        runCurrent()
        assertTrue(vm.state.value.canResend)
    }

    @Test
    fun primary_request_is_deduplicated_while_busy() = runTest {
        val gate = CompletableDeferred<Unit>()
        val driver = FakeAuthDriver(requestGate = gate)
        val vm = viewModel(driver, this)
        vm.onEmailChange("operator@effy.example")

        vm.sendCode()
        vm.sendCode()
        runCurrent()
        assertEquals(AuthSubmission.SendingCode, vm.state.value.submission)
        assertEquals(1, driver.requestCount)

        gate.complete(Unit)
        runCurrent()
        assertEquals(AuthStage.Code, vm.state.value.stage)
    }

    @Test
    fun paste_is_normalized_and_incorrect_or_expired_code_preserves_input() = runTest {
        val driver = FakeAuthDriver()
        val vm = viewModel(driver, this, cooldown = 0)
        vm.onEmailChange("operator@effy.example")
        vm.sendCode()
        runCurrent()

        vm.onCodeChange(" 12-34 56 words")
        assertEquals("123456", vm.state.value.codeInput)
        driver.confirmResult = AuthStep.Failed(AuthError.CodeIncorrect)
        vm.submitCode()
        runCurrent()
        assertEquals("123456", vm.state.value.codeInput)
        assertEquals(AuthFieldError.InvalidCode, vm.state.value.fieldError)

        vm.onCodeChange("654321")
        driver.confirmResult = AuthStep.Failed(AuthError.CodeExpired)
        vm.submitCode()
        runCurrent()
        assertEquals("654321", vm.state.value.codeInput)
        assertEquals(AuthFieldError.ExpiredCode, vm.state.value.fieldError)
    }

    @Test
    fun invalid_identity_uses_uniform_message_and_resend_is_deduplicated() = runTest {
        val driver = FakeAuthDriver(requestResult = AuthStep.Failed(AuthError.InvalidCredentials))
        val vm = viewModel(driver, this, cooldown = 0)
        vm.onEmailChange("unknown@effy.example")
        vm.sendCode()
        runCurrent()
        assertEquals("We couldn't sign you in. Check your email and try again.", vm.state.value.message)
        assertNull(vm.state.value.fieldError)

        driver.requestResult = AuthStep.NeedsOtp("unknown@effy.example")
        vm.sendCode()
        runCurrent()
        vm.resendCode()
        vm.resendCode()
        runCurrent()
        assertEquals(3, driver.requestCount)
    }

    @Test
    fun back_clears_code_context_and_success_hands_off_to_session_authority() = runTest {
        val driver = FakeAuthDriver()
        val session = sessionManager(driver, this)
        val vm = AuthViewModel(
            RequestSignInCode(driver),
            ConfirmSignIn(driver),
            session,
            resendCooldownSeconds = 0,
            coroutineScope = this,
        )
        vm.onEmailChange("operator@effy.example")
        vm.sendCode()
        runCurrent()
        vm.onCodeChange("123456")
        assertTrue(vm.onBack())
        assertEquals(AuthStage.Email, vm.state.value.stage)
        assertEquals("", vm.state.value.codeInput)

        vm.sendCode()
        runCurrent()
        vm.onCodeChange("123456")
        driver.confirmResult = AuthStep.Done(Session("subject", "access", "id"))
        vm.submitCode()
        runCurrent()
        assertIs<SessionState.SignedIn>(session.state.value)
    }

    private fun viewModel(driver: FakeAuthDriver, scope: TestScope, cooldown: Int = 30): AuthViewModel =
        AuthViewModel(
            RequestSignInCode(driver),
            ConfirmSignIn(driver),
            sessionManager(driver, scope),
            resendCooldownSeconds = cooldown,
            coroutineScope = scope,
        )

    private fun sessionManager(driver: AuthDriver, scope: TestScope): SessionManager {
        val repository = object : ShopRepository {
            override suspend fun me() = Operator(
                subject = "subject",
                email = "operator@effy.example",
                roles = listOf(ShopRole.MANAGER),
                status = OperatorStatus.ACTIVE,
                shop = AssignedShop("shop", "S1", "Effy Shop", ShopLifecycle.ACTIVE),
            )
            override suspend fun managerAccess() = ManagerAccess.GRANTED
        }
        return SessionManager(driver, GetOperator(repository), scope)
    }

    private class FakeAuthDriver(
        var requestResult: AuthStep = AuthStep.NeedsOtp("operator@effy.example"),
        var confirmResult: AuthStep = AuthStep.Failed(AuthError.CodeIncorrect),
        private val requestGate: CompletableDeferred<Unit>? = null,
    ) : AuthDriver {
        override val sessionChanges: Flow<Unit> = emptyFlow()
        var requestCount = 0
        var confirmCount = 0
        var lastEmail: String? = null

        override suspend fun currentSession(forceRefresh: Boolean): Session? = null
        override suspend fun signInWithEmailOtp(email: String): AuthStep {
            requestCount++
            lastEmail = email
            requestGate?.await()
            return requestResult
        }
        override suspend fun confirmOtp(code: String): AuthStep {
            confirmCount++
            return confirmResult
        }
        override suspend fun signOut() = Unit
    }
}
