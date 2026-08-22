package com.effyshopping.driver.mobile.features.collection

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.features.collection.domain.CheckInHub
import com.effyshopping.driver.mobile.features.collection.domain.CollectStop
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRepository
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.CollectionStop
import com.effyshopping.driver.mobile.features.collection.domain.GetCollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.GetShopStop
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.ReportCollectionIssue
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

private class FakeCollectionRepo(
    var run: CollectionRun? = null,
    var split: HubSplit? = null,
    var fail: AppError? = null,
) : CollectionRepository {
    var collectedStop: String? = null
    override suspend fun getRun(runId: String): CollectionRun = fail?.let { throw AppException(it) } ?: run!!
    override suspend fun getStop(runId: String, stopId: String): ShopStop =
        ShopStop(stopId, "Shop", "S1", emptyList(), StopStatus.ASSIGNED)
    override suspend fun collect(runId: String, stopId: String, changeId: String) {
        fail?.let { throw AppException(it) }; collectedStop = stopId
    }
    override suspend fun reportIssue(runId: String, stopId: String, kind: String, note: String?, changeId: String) {}
    override suspend fun checkIn(runId: String, changeId: String): HubSplit = fail?.let { throw AppException(it) } ?: split!!
}

class CollectionViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private fun vm(repo: FakeCollectionRepo) = CollectionViewModel(
        runId = "r1",
        getRun = GetCollectionRun(repo),
        getStop = GetShopStop(repo),
        collectStop = CollectStop(repo),
        reportIssue = ReportCollectionIssue(repo),
        checkInHub = CheckInHub(repo),
        newChangeId = { "cid" },
    )

    @Test fun loads_a_run() = runTest {
        val repo = FakeCollectionRepo(run = CollectionRun("r1", "active", listOf(
            CollectionStop("s1", 0, "Shop", "S1", 2, StopStatus.ASSIGNED),
        )))
        val v = vm(repo); v.loadRun()
        assertEquals(1, v.state.value.run?.stops?.size)
        assertNull(v.state.value.message)
    }

    @Test fun a_network_error_surfaces_a_user_message_not_a_crash() = runTest {
        val v = vm(FakeCollectionRepo(fail = AppError.Network)); v.loadRun()
        assertNotNull(v.state.value.message)
        assertNull(v.state.value.run)
    }

    @Test fun collect_invokes_the_use_case_and_calls_back() = runTest {
        val repo = FakeCollectionRepo()
        val v = vm(repo)
        var done = false
        v.collect("s1") { done = true }
        assertEquals("s1", repo.collectedStop)
        assertEquals(true, done)
    }

    @Test fun check_in_stores_the_split() = runTest {
        val repo = FakeCollectionRepo(split = HubSplit(23, 9, 14))
        val v = vm(repo); v.checkIn()
        assertEquals(9, v.state.value.hubSplit?.sameDayCount)
        assertEquals(14, v.state.value.hubSplit?.standardCount)
    }
}
