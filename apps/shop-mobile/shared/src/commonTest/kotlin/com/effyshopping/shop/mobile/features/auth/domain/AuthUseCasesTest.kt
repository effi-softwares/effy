package com.effyshopping.shop.mobile.features.auth.domain

import com.effyshopping.shop.mobile.core.auth.AuthDriver
import com.effyshopping.shop.mobile.core.auth.AuthStep
import com.effyshopping.shop.mobile.core.auth.Session
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The use-case layer earns its place by being trivially testable with a fake driver — no Amplify, no
 * platform. Here we prove the one bit of real logic the use case owns: input normalization (trimming).
 */
class AuthUseCasesTest {

    /** Records the exact argument the driver received, so we can assert normalization happened. */
    private class RecordingAuthDriver : AuthDriver {
        var lastEmail: String? = null
        var lastCode: String? = null
        override val sessionChanges: Flow<Unit> = emptyFlow()
        override suspend fun currentSession(forceRefresh: Boolean): Session? = null
        override suspend fun signInWithEmailOtp(email: String): AuthStep {
            lastEmail = email
            return AuthStep.NeedsOtp("e@example.com")
        }
        override suspend fun confirmOtp(code: String): AuthStep {
            lastCode = code
            return AuthStep.Failed(com.effyshopping.shop.mobile.core.auth.AuthError.CodeIncorrect)
        }
        override suspend fun signOut() {}
    }

    @Test
    fun request_sign_in_code_trims_the_email() = runTest {
        val driver = RecordingAuthDriver()
        RequestSignInCode(driver)("   Op@Effy.example  ")
        assertEquals("Op@Effy.example", driver.lastEmail)
    }

    @Test
    fun confirm_sign_in_trims_the_code() = runTest {
        val driver = RecordingAuthDriver()
        ConfirmSignIn(driver)("  123456 ")
        assertEquals("123456", driver.lastCode)
    }
}
