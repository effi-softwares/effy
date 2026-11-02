package com.effyshopping.customer.mobile.core.session

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.auth.AuthStep
import com.effyshopping.customer.mobile.core.auth.Session
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.CustomerName
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.CustomerStanding
import com.effyshopping.customer.mobile.features.account.domain.GetCustomer
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Only the platform ends a session. The record being unreadable - a stopped database, a dropped
 * connection - must leave the shopper signed in and waiting, never on the sign-in page.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionManagerTest {

    private val customer = Customer(
        id = "c-1",
        email = "shopper@example.com",
        name = CustomerName("Test", "Shopper"),
        phone = null,
        standing = CustomerStanding.ACTIVE,
        hasPassword = false,
        passwordSetAtIso = null,
        createdAtIso = "2026-07-14T00:00:00Z",
    )

    private val session = Session("sub", "id-token", "access-token")

    /** Each call takes the next scripted answer; the last one repeats. */
    private class Script<T>(vararg answers: () -> T) {
        private val answers = answers.toMutableList()
        var calls = 0
        fun next(): T {
            calls++
            return (if (answers.size > 1) answers.removeAt(0) else answers.first())()
        }
    }

    private fun <T> failing(error: AppError): () -> T = { throw AppException(error) }

    private inner class Harness(
        val sessions: Script<Session?> = Script({ session }),
        val refreshes: Script<Session?> = Script({ session }),
        val records: Script<Customer>,
    ) {
        var signOuts = 0
        var authenticatedFired = 0
        var signedOutFired = 0
        val changes = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

        private val driver = object : AuthDriver {
            override val sessionChanges = changes
            override suspend fun currentSession(forceRefresh: Boolean) =
                if (forceRefresh) refreshes.next() else sessions.next()
            override suspend fun signOut() { signOuts++ }
            override suspend fun signUpWithPassword(email: String, password: String) = unused()
            override suspend fun signUpPasswordless(email: String) = unused()
            override suspend fun confirmSignUp(email: String, code: String) = unused()
            override suspend fun resendSignUpCode(email: String) = unused()
            override suspend fun signInWithPassword(email: String, password: String) = unused()
            override suspend fun signInWithEmailOtp(email: String) = unused()
            override suspend fun confirmOtp(code: String) = unused()
            override suspend fun resendSignInCode(email: String) = unused()
            override suspend fun startPasswordReset(email: String) = unused()
            private fun unused(): AuthStep = error("not part of these tests")
        }

        private val repository = object : CustomerRepository {
            override suspend fun me(seedPassword: Boolean) = records.next()
            override suspend fun updateProfile(given: String?, family: String?, phone: String?) = unused<Customer>()
            override suspend fun requestPasswordChallenge() = unused<String>()
            override suspend fun setPassword(code: String, newPassword: String) = unused<Customer>()
            override suspend fun changePassword(current: String, newPassword: String) = unused<Customer>()
            override suspend fun signOutEverywhere() = unused<Unit>()
            override suspend fun confirmPasswordReset(email: String, code: String, newPassword: String) = unused<Unit>()
            private fun <T> unused(): T = error("not part of these tests")
        }

        fun manager(scope: TestScope) = SessionManager(
            authDriver = driver,
            getCustomer = GetCustomer(repository),
            scope = scope.backgroundScope,
            onAuthenticated = { authenticatedFired++ },
            onSignedOut = { signedOutFired++ },
        )
    }

    private fun runSession(block: suspend TestScope.() -> Unit) = runTest(UnconfinedTestDispatcher()) { block() }

    @Test
    fun `no session is a guest`() = runSession {
        val h = Harness(sessions = Script({ null }), records = Script({ customer }))
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Guest, manager.state.value)
        assertEquals(0, h.records.calls)
    }

    @Test
    fun `an unreachable database leaves a signed-in shopper signed in`() = runSession {
        val h = Harness(records = Script(failing(AppError.Unavailable)))
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Unreachable, manager.state.value)
        assertEquals(3, h.records.calls, "one attempt and two retries, as before")
        assertEquals(0, h.signOuts)
        assertEquals(0, h.signedOutFired)
    }

    @Test
    fun `no connection and rate limiting wait the same way`() = runSession {
        for (error in listOf(AppError.Network, AppError.RateLimited())) {
            val h = Harness(records = Script(failing(error)))
            val manager = h.manager(this)

            manager.bootstrap()

            assertEquals(SessionState.Unreachable, manager.state.value)
            assertEquals(0, h.signOuts)
        }
    }

    @Test
    fun `an answer the app does not understand is not a sign-out either`() = runSession {
        val h = Harness(records = Script(failing(AppError.Unexpected)))
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Unreachable, manager.state.value)
        assertEquals(0, h.signOuts)
    }

    @Test
    fun `a driver that cannot produce a token is not a signed-out driver`() = runSession {
        val h = Harness(
            sessions = Script(failing(AppError.Network)),
            records = Script(failing(AppError.Network)),
        )
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Unreachable, manager.state.value)
        assertEquals(0, h.signOuts)
    }

    @Test
    fun `retry brings the shopper in once the record is back`() = runSession {
        val h = Harness(
            records = Script(
                failing(AppError.Unavailable),
                failing(AppError.Unavailable),
                failing(AppError.Unavailable),
                { customer },
            ),
        )
        val manager = h.manager(this)
        manager.bootstrap()

        manager.retry()

        assertEquals(SessionState.Authenticated(customer), manager.state.value)
        assertEquals(1, h.authenticatedFired, "the cart merge runs when the shopper finally arrives")
    }

    @Test
    fun `retry keeps waiting while the record is still out of reach`() = runSession {
        val h = Harness(records = Script(failing(AppError.Unavailable)))
        val manager = h.manager(this)
        manager.bootstrap()

        manager.retry()

        assertEquals(SessionState.Unreachable, manager.state.value)
    }

    @Test
    fun `retry does nothing from any other state`() = runSession {
        val h = Harness(sessions = Script({ null }), records = Script({ customer }))
        val manager = h.manager(this)
        manager.bootstrap()

        manager.retry()

        assertEquals(SessionState.Guest, manager.state.value)
        assertEquals(0, h.records.calls)
    }

    @Test
    fun `a sign-in that cannot read the record waits instead of bouncing back to sign-in`() = runSession {
        val h = Harness(sessions = Script({ null }), records = Script(failing(AppError.Unavailable)))
        val manager = h.manager(this)
        manager.bootstrap()

        manager.onSignedIn()

        assertEquals(SessionState.Unreachable, manager.state.value)
    }

    @Test
    fun `a failed re-read takes nothing away from a shopper already in the app`() = runSession {
        val h = Harness(records = Script({ customer }, failing(AppError.Unavailable)))
        val manager = h.manager(this)
        manager.bootstrap()

        manager.refreshRecord()

        assertEquals(SessionState.Authenticated(customer), manager.state.value)
    }

    @Test
    fun `a stale token is renewed once and the shopper never notices`() = runSession {
        val h = Harness(records = Script(failing(AppError.Unauthenticated), { customer }))
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Authenticated(customer), manager.state.value)
        assertEquals(1, h.refreshes.calls)
        assertEquals(0, h.signOuts)
    }

    @Test
    fun `a refusal that survives a fresh token ends the session`() = runSession {
        val h = Harness(records = Script(failing(AppError.Unauthenticated)))
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Guest, manager.state.value)
        assertEquals(1, h.refreshes.calls, "renewed once, not in a loop")
        assertEquals(1, h.signOuts)
        assertEquals(1, h.signedOutFired)
    }

    @Test
    fun `a refusal with no session left to renew ends the session`() = runSession {
        val h = Harness(refreshes = Script({ null }), records = Script(failing(AppError.Unauthenticated)))
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Guest, manager.state.value)
        assertEquals(1, h.signOuts)
    }

    @Test
    fun `a refusal that cannot be checked because the renewal failed is not a sign-out`() = runSession {
        val h = Harness(
            refreshes = Script(failing(AppError.Network)),
            records = Script(failing(AppError.Unauthenticated)),
        )
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Unreachable, manager.state.value)
        assertEquals(0, h.signOuts)
    }

    @Test
    fun `a barred account is still refused`() = runSession {
        val h = Harness(records = Script(failing(AppError.Forbidden)))
        val manager = h.manager(this)

        manager.bootstrap()

        assertEquals(SessionState.Barred, manager.state.value)
        assertEquals(1, h.signOuts)
    }

    @Test
    fun `a session that ends underneath a shopper clears the device`() = runSession {
        val h = Harness(sessions = Script({ session }, { null }), records = Script({ customer }))
        val manager = h.manager(this)
        manager.bootstrap()
        assertTrue(manager.state.value is SessionState.Authenticated)

        h.changes.emit(Unit)

        assertEquals(SessionState.Guest, manager.state.value)
        assertEquals(1, h.signedOutFired)
    }
}
