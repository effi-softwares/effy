package com.effyshopping.driver.mobile.features.today

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DriverRepository
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.driver.domain.SetDuty
import com.effyshopping.driver.mobile.features.driver.domain.Vehicle
import com.effyshopping.driver.mobile.features.today.domain.GetToday
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.domain.Today
import com.effyshopping.driver.mobile.features.today.domain.TodayItem
import com.effyshopping.driver.mobile.features.today.domain.TodayRepository
import com.effyshopping.driver.mobile.features.today.presentation.TodayViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 092 T013 — the states Today draws: off duty, loading failed, offline over a held copy, a run, idle. */
class TodayViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private class Repo(var today: Today? = null, var fail: AppError? = null) : TodayRepository {
        var reads = 0
        override suspend fun today(): Today {
            reads++
            fail?.let { throw AppException(it) }
            return today!!
        }
    }

    private class Drivers : DriverRepository {
        var duty = DutyStatus.OFF_DUTY
        private fun me(d: DutyStatus) = Driver("d1", "Ada", "ada@effyshopping.com", null, "Carlton hub", Vehicle(null, null), d)
        override suspend fun me(): Driver = me(duty)
        override suspend fun setDuty(onDuty: Boolean, changeId: String): Driver {
            duty = if (onDuty) DutyStatus.ON_DUTY else DutyStatus.OFF_DUTY
            return me(duty)
        }
    }

    private val run = Today(
        Phase.COLLECTION, "r1",
        TodayItem(TodayItem.Kind.COLLECTION_STOP, "s1", "r1", "Brunswick store", "Sydney Rd", "assigned"),
        emptyList(), 3,
    )

    private fun vm(repo: Repo, drivers: Drivers, duty: DutyStatus) =
        TodayViewModel(initialDuty = duty, getToday = GetToday(repo), setDuty = SetDuty(drivers), newChangeId = { "c" }, now = { 42L })

    /**
     * 092 rev 2 — the reported defect: a driver collected the first shop, came back, and Today still
     * said "Next · stop 1". Their own change is never announced back to them, so coming back is when
     * Today must re-read — quietly, with no spinner over the run already on screen.
     */
    @Test fun coming_back_to_today_reads_it_again_quietly() = runTest {
        val repo = Repo(run)
        val v = vm(repo, Drivers(), DutyStatus.ON_DUTY)
        assertEquals(1, repo.reads)
        repo.today = run.copy(active = TodayItem(TodayItem.Kind.COLLECTION_STOP, "s2", "r1", "Northcote store", "High St", "assigned"))
        v.shown()
        assertEquals(2, repo.reads)
        assertEquals("Northcote store", v.state.value.today?.active?.title)
        assertFalse(v.state.value.isLoading)
    }

    @Test fun shown_off_duty_reads_nothing() = runTest {
        val repo = Repo(run)
        val v = vm(repo, Drivers(), DutyStatus.OFF_DUTY)
        v.shown()
        assertEquals(0, repo.reads)
    }

    @Test fun off_duty_reads_nothing() = runTest {
        val repo = Repo(run)
        val v = vm(repo, Drivers(), DutyStatus.OFF_DUTY)
        assertEquals(0, repo.reads)
        assertNull(v.state.value.today)
    }

    @Test fun going_on_duty_loads_the_run_and_off_duty_clears_it() = runTest {
        val repo = Repo(run); val drivers = Drivers()
        val v = vm(repo, drivers, DutyStatus.OFF_DUTY)
        v.toggleDuty()
        assertEquals(DutyStatus.ON_DUTY, v.state.value.dutyStatus)
        assertEquals("Brunswick store", v.state.value.today?.active?.title)
        assertEquals(42L, v.state.value.syncedAtEpochMillis)
        v.toggleDuty()
        assertNull(v.state.value.today)
    }

    @Test fun a_failed_first_load_is_the_error_state_not_idle() = runTest {
        val v = vm(Repo(fail = AppError.Unexpected), Drivers(), DutyStatus.ON_DUTY)
        assertTrue(v.state.value.loadFailed)
        assertNull(v.state.value.today)
    }

    @Test fun no_signal_over_a_held_run_is_the_offline_banner() = runTest {
        val repo = Repo(run)
        val v = vm(repo, Drivers(), DutyStatus.ON_DUTY)
        repo.fail = AppError.Network
        v.refresh()
        assertTrue(v.state.value.offline)
        assertFalse(v.state.value.loadFailed)
        assertNull(v.state.value.message)
        assertEquals("Brunswick store", v.state.value.today?.active?.title)
    }

    @Test fun nothing_assigned_is_idle() = runTest {
        val v = vm(Repo(Today(Phase.IDLE, null, null, emptyList(), 0)), Drivers(), DutyStatus.ON_DUTY)
        assertEquals(Phase.IDLE, v.state.value.today?.phase)
        assertNull(v.state.value.today?.active)
    }
}
