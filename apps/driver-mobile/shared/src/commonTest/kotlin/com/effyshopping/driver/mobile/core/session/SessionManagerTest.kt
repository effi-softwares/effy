package com.effyshopping.driver.mobile.core.session

import com.effyshopping.driver.mobile.core.auth.AuthDriver
import com.effyshopping.driver.mobile.core.auth.AuthStep
import com.effyshopping.driver.mobile.core.auth.Session
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DriverRepository
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.driver.domain.GetDriverIdentity
import com.effyshopping.driver.mobile.features.driver.domain.Vehicle
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

private val ada = Driver("d1", "Ada", "ada@effyshopping.com", null, null, Vehicle(null, null), DutyStatus.ON_DUTY)

private class FakeAuth(var session: Session?, var holds: Boolean) : AuthDriver {
    var signedOut = false
    override val sessionChanges: Flow<Unit> = emptyFlow()
    override suspend fun currentSession(forceRefresh: Boolean): Session? = session
    override suspend fun holdsSignIn(): Boolean = holds
    override suspend fun signInWithEmailOtp(email: String): AuthStep = error("unused")
    override suspend fun confirmOtp(code: String): AuthStep = error("unused")
    override suspend fun signOut() { signedOut = true }
}

private class FakeDrivers(var fail: AppError? = null, var kept: Driver? = null) : DriverRepository {
    override suspend fun me(): Driver = fail?.let { throw AppException(it) } ?: ada
    override fun lastKnown(): Driver? = kept
    override suspend fun setDuty(onDuty: Boolean, changeId: String): Driver = ada
}

class SessionManagerTest {
    private fun TestScope.manager(auth: AuthDriver, drivers: DriverRepository, cleared: () -> Unit = {}) =
        SessionManager(auth, GetDriverIdentity(drivers), this, onSignedOut = cleared)

    /** Backlog C3 — opening in a loading dock: tokens cannot refresh, the device is still signed in. */
    @Test fun offline_with_a_kept_record_opens_signed_in_offline() = runTest {
        val m = manager(FakeAuth(session = null, holds = true), FakeDrivers(fail = AppError.Network, kept = ada))
        m.bootstrap()
        val s = m.state.value
        assertIs<SessionState.SignedIn>(s)
        assertTrue(s.offline)
        assertEquals("d1", s.driver.id)
    }

    @Test fun offline_with_nothing_kept_is_signed_out() = runTest {
        val m = manager(FakeAuth(session = null, holds = true), FakeDrivers(fail = AppError.Network))
        m.bootstrap()
        assertEquals(SessionState.SignedOut, m.state.value)
    }

    @Test fun a_device_holding_no_sign_in_is_signed_out() = runTest {
        val m = manager(FakeAuth(session = null, holds = false), FakeDrivers(kept = ada))
        m.bootstrap()
        assertEquals(SessionState.SignedOut, m.state.value)
    }

    /** Backlog C4 — a driver disabled mid-shift is refused on their next request, and nothing is kept. */
    @Test fun a_rejected_request_mid_shift_ends_in_refused() = runTest {
        var cleared = false
        val drivers = FakeDrivers()
        val auth = FakeAuth(session = Session("sub", "a", "i"), holds = true)
        val m = manager(auth, drivers) { cleared = true }
        m.bootstrap()
        assertIs<SessionState.SignedIn>(m.state.value)

        drivers.fail = AppError.Forbidden
        m.onRequestRejected()
        advanceUntilIdle()
        assertEquals(SessionState.Refused, m.state.value)
        assertTrue(auth.signedOut)
        assertTrue(cleared)
    }
}
