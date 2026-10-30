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
import kotlinx.coroutines.test.runCurrent
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
    var record: Driver = ada
    override suspend fun me(): Driver = fail?.let { throw AppException(it) } ?: record
    override fun lastKnown(): Driver? = kept
    override suspend fun setDuty(onDuty: Boolean, changeId: String): Driver = ada
}

class SessionManagerTest {
    private fun TestScope.manager(auth: AuthDriver, drivers: DriverRepository, cleared: () -> Unit = {}) =
        SessionManager(auth, GetDriverIdentity(drivers), this, onSignedOut = cleared)

    /**
     * Rev 2 - back-office gave the driver another van mid-shift. Its driver edit tells the driver
     * "work"; the record is re-read on it, so Today and Account stop showing the old van.
     */
    @Test fun work_changed_re_reads_the_driver_record() = runTest {
        val work = kotlinx.coroutines.flow.MutableSharedFlow<Unit>()
        val drivers = FakeDrivers()
        // backgroundScope: the manager listens for the rest of the session, which a test never ends.
        val m = SessionManager(FakeAuth(Session("sub", "a", "i"), holds = true), GetDriverIdentity(drivers), backgroundScope, workChanges = work)
        m.bootstrap()
        runCurrent() // the manager is listening before anything is said
        drivers.record = ada.copy(vehicle = Vehicle("Van", "EFY-002"))
        work.emit(Unit)
        advanceUntilIdle()
        assertEquals("EFY-002", (m.state.value as SessionState.SignedIn).driver.vehicle.plate)
    }

    /** A failed re-read changes nothing - "could not check" is never "signed out". */
    @Test fun a_failed_re_read_keeps_the_record() = runTest {
        val work = kotlinx.coroutines.flow.MutableSharedFlow<Unit>()
        val drivers = FakeDrivers()
        val m = SessionManager(FakeAuth(Session("sub", "a", "i"), holds = true), GetDriverIdentity(drivers), backgroundScope, workChanges = work)
        m.bootstrap()
        runCurrent()
        drivers.fail = AppError.Network
        work.emit(Unit)
        advanceUntilIdle()
        assertEquals("d1", (m.state.value as SessionState.SignedIn).driver.id)
    }

    /** Backlog C3 - opening in a loading dock: tokens cannot refresh, the device is still signed in. */
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

    /** Backlog C4 - a driver disabled mid-shift is refused on their next request, and nothing is kept. */
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
