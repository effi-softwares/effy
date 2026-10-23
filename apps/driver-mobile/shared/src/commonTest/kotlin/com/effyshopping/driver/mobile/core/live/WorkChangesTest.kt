package com.effyshopping.driver.mobile.core.live

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.core.scan.HandedOver
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRepository
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.PackageOutcome
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DriverRepository
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.driver.domain.Vehicle
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * 092 rev 2 — the reported defect: a driver collected shop one, came back, and Today still said
 * "Next · stop 1 of 2". The server never announces a driver's own change back to them, so the app says
 * it to itself — once the platform HAS the change, never for a write saved with no signal.
 */
class WorkChangesTest {
    private class Collection(var outcome: WriteOutcome = WriteOutcome.SENT, var split: HubSplit? = HubSplit(1, 0, emptyList()), var fail: Boolean = false) : CollectionRepository {
        override suspend fun getRun(runId: String): CollectionRun = error("not read")
        override suspend fun getStop(runId: String, stopId: String): ShopStop = error("not read")
        override suspend fun collect(runId: String, stopId: String, changeId: String, outcomes: List<PackageOutcome>, handed: List<HandedOver>, missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag>): com.effyshopping.driver.mobile.features.collection.domain.Collected {
            if (fail) throw AppException(AppError.Unexpected)
            return com.effyshopping.driver.mobile.features.collection.domain.Collected(outcome)
        }
        override suspend fun checkIn(runId: String, changeId: String, handed: List<HandedOver>, missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag>): HubSplit? = split
    }

    private class Drivers : DriverRepository {
        override suspend fun me() = Driver("d1", "Ada", "ada@effyshopping.com", null, null, Vehicle(null, null), DutyStatus.ON_DUTY)
        override suspend fun setDuty(onDuty: Boolean, changeId: String) = me()
    }

    @Test fun a_collection_that_lands_tells_every_screen() = runTest(UnconfinedTestDispatcher()) {
        val work = WorkChanges(emptyFlow())
        var heard = 0
        val job = launch { work.changes.collect { heard++ } }
        SignallingCollectionRepository(Collection(), work).collect("r1", "s1", "c1", emptyList())
        assertEquals(1, heard)
        job.cancel()
    }

    @Test fun a_collection_saved_with_no_signal_says_nothing_yet() = runTest(UnconfinedTestDispatcher()) {
        val work = WorkChanges(emptyFlow())
        var heard = 0
        val job = launch { work.changes.collect { heard++ } }
        SignallingCollectionRepository(Collection(outcome = WriteOutcome.QUEUED), work).collect("r1", "s1", "c1", emptyList())
        // Re-reading now would fetch the copy without it; the sync coordinator speaks once it is sent.
        assertEquals(0, heard)
        job.cancel()
    }

    @Test fun a_refused_write_says_nothing() = runTest(UnconfinedTestDispatcher()) {
        val work = WorkChanges(emptyFlow())
        var heard = 0
        val job = launch { work.changes.collect { heard++ } }
        assertFailsWith<AppException> { SignallingCollectionRepository(Collection(fail = true), work).collect("r1", "s1", "c1", emptyList()) }
        assertEquals(0, heard)
        job.cancel()
    }

    @Test fun a_check_in_speaks_only_when_the_platform_answered() = runTest(UnconfinedTestDispatcher()) {
        val work = WorkChanges(emptyFlow())
        var heard = 0
        val job = launch { work.changes.collect { heard++ } }
        val repo = Collection()
        SignallingCollectionRepository(repo, work).checkIn("r1", "c1", emptyList())
        repo.split = null // saved to send
        SignallingCollectionRepository(repo, work).checkIn("r1", "c2", emptyList())
        assertEquals(1, heard)
        job.cancel()
    }

    @Test fun going_on_duty_speaks() = runTest(UnconfinedTestDispatcher()) {
        val work = WorkChanges(emptyFlow())
        var heard = 0
        val job = launch { work.changes.collect { heard++ } }
        SignallingDriverRepository(Drivers(), work).setDuty(true, "c1")
        assertEquals(1, heard)
        job.cancel()
    }

    @Test fun the_live_channel_still_speaks_through_it() = runTest(UnconfinedTestDispatcher()) {
        val server = MutableSharedFlow<Unit>()
        val work = WorkChanges(server)
        var heard = 0
        val job = launch { work.changes.collect { heard++ } }
        server.emit(Unit)
        assertEquals(1, heard)
        job.cancel()
    }
}
