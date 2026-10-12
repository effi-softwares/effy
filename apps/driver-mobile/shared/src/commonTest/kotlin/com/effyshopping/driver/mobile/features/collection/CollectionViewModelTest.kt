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
import com.effyshopping.driver.mobile.features.collection.domain.CollectionPackage
import com.effyshopping.driver.mobile.features.collection.domain.PackageMethod
import com.effyshopping.driver.mobile.features.collection.domain.PackageOutcome
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus
import com.effyshopping.driver.mobile.features.collection.domain.StopDrafts
import com.effyshopping.driver.mobile.features.collection.data.SettingsStopDrafts
import com.russhwolf.settings.MapSettings
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
    var packages: List<CollectionPackage> = emptyList()
    var outcomes: List<PackageOutcome>? = null
    override suspend fun getStop(runId: String, stopId: String): ShopStop =
        ShopStop(stopId, "Shop", "S1", packages, StopStatus.ASSIGNED)
    override suspend fun collect(runId: String, stopId: String, changeId: String, outcomes: List<PackageOutcome>) {
        fail?.let { throw AppException(it) }; collectedStop = stopId; this.outcomes = outcomes
    }
    override suspend fun checkIn(runId: String, changeId: String): HubSplit = fail?.let { throw AppException(it) } ?: split!!
}

class CollectionViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private fun vm(repo: FakeCollectionRepo, drafts: StopDrafts? = null) = CollectionViewModel(
        runId = "r1",
        getRun = GetCollectionRun(repo),
        getStop = GetShopStop(repo),
        collectStop = CollectStop(repo),
        checkInHub = CheckInHub(repo),
        newChangeId = { "cid" },
        drafts = drafts,
    )

    /** The phone closed the app while the driver was loading: what they entered must still be there. */
    @Test fun ticks_and_reports_survive_the_app_being_closed_and_go_once_collected() = runTest {
        val drafts = SettingsStopDrafts(MapSettings())
        val repo = FakeCollectionRepo().apply { packages = listOf(pkg("a"), pkg("b")) }
        vm(repo, drafts).apply { loadStop("s1"); togglePackage("a"); reportPackage("b", "Damaged", "torn") }

        val reopened = vm(repo, drafts)
        reopened.loadStop("s1")
        assertEquals(setOf("a"), reopened.state.value.confirmedPackageIds)
        assertEquals("Damaged — torn", reopened.state.value.reportedPackages["b"]?.asNote())

        reopened.collect("s1") {}
        val after = vm(repo, drafts)
        after.loadStop("s1")
        assertEquals(emptySet(), after.state.value.confirmedPackageIds)
    }

    @Test fun a_kept_stop_is_not_applied_to_a_different_stop() = runTest {
        val drafts = SettingsStopDrafts(MapSettings())
        val repo = FakeCollectionRepo().apply { packages = listOf(pkg("a")) }
        vm(repo, drafts).apply { loadStop("s1"); togglePackage("a") }
        val other = vm(repo, drafts)
        other.loadStop("s2")
        assertEquals(emptySet(), other.state.value.confirmedPackageIds)
    }

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

    private fun pkg(id: String) = CollectionPackage(
        ref = "EFY-$id", destinationSuburb = "Carlton", method = PackageMethod.SAME_DAY,
        items = emptyList(), summary = ClassSummary.Empty, packageId = id,
    )

    /**
     * A report names ITS package and rides the collect. It used to be a request of its own that named
     * none, which the platform reads as every package at the stop.
     */
    @Test fun a_reported_package_is_sent_as_not_collected_and_the_rest_as_collected() = runTest {
        val repo = FakeCollectionRepo().apply { packages = listOf(pkg("a"), pkg("b")) }
        val v = vm(repo); v.loadStop("s1")
        v.togglePackage("a")
        v.reportPackage("b", "Damaged", "box crushed")
        v.collect("s1") {}
        assertEquals(
            listOf(PackageOutcome("a", true, null), PackageOutcome("b", false, "Damaged — box crushed")),
            repo.outcomes,
        )
    }

    /** Coming back from the problem screen opens the same stop again; the ticks must still be there. */
    @Test fun reopening_the_same_stop_keeps_ticks_and_a_different_stop_drops_them() = runTest {
        val repo = FakeCollectionRepo().apply { packages = listOf(pkg("a"), pkg("b")) }
        val v = vm(repo); v.loadStop("s1")
        v.togglePackage("a"); v.reportPackage("b", "Damaged", null)
        v.loadStop("s1")
        assertEquals(setOf("a"), v.state.value.confirmedPackageIds)
        assertEquals(setOf("b"), v.state.value.reportedPackages.keys)
        v.loadStop("s2")
        assertEquals(emptySet(), v.state.value.confirmedPackageIds)
        assertEquals(emptyMap(), v.state.value.reportedPackages)
    }

    @Test fun check_in_stores_the_split() = runTest {
        val repo = FakeCollectionRepo(split = HubSplit(23, 9, 14))
        val v = vm(repo); v.checkIn()
        assertEquals(9, v.state.value.hubSplit?.sameDayCount)
        assertEquals(14, v.state.value.hubSplit?.standardCount)
    }

    /**
     * 072 — the platform refused a collect because the round has not opened. The driver is told WHEN
     * it opens, in the server's words — not "someone else changed this", and not a generic failure.
     */
    @Test fun a_collect_before_the_round_opens_says_when_it_opens() = runTest {
        val opening = com.effyshopping.driver.mobile.core.opening.Opening(1_791_436_500_000L, "4:15 pm")
        val repo = FakeCollectionRepo(fail = AppError.NotOpenYet(opening))
        val v = vm(repo)
        var done = false
        v.collect("s1") { done = true }
        assertEquals(false, done)
        assertNull(repo.collectedStop)
        assertEquals("This round isn't open yet. Opens 4:15 pm.", v.state.value.message)
        assertEquals(false, v.state.value.isWorking)
    }
}
