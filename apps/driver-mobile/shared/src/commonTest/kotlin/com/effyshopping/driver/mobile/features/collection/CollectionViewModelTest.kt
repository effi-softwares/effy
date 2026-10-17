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
import kotlin.test.assertTrue
import kotlin.test.assertFalse
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import com.effyshopping.driver.mobile.core.offline.WriteOutcome

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
    /** When true, writes answer as saved-to-send, as the real repository does with no signal. */
    var offline = false
    val changeIds = mutableListOf<String>()
    /** 093 — how many packages the next collect leaves waiting (added while the driver was there). */
    var remaining = 0
    override suspend fun collect(runId: String, stopId: String, changeId: String, outcomes: List<PackageOutcome>): com.effyshopping.driver.mobile.features.collection.domain.Collected {
        fail?.let { throw AppException(it) }; collectedStop = stopId; this.outcomes = outcomes
        changeIds += changeId
        return com.effyshopping.driver.mobile.features.collection.domain.Collected(if (offline) WriteOutcome.QUEUED else WriteOutcome.SENT, remaining)
    }
    var handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()
    var missing: List<String> = emptyList()
    override suspend fun checkIn(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>, missing: List<String>): HubSplit? {
        fail?.let { throw AppException(it) }
        this.handed = handed
        this.missing = missing
        changeIds += changeId
        return if (offline) null else split!!
    }
}

class CollectionViewModelTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private fun vm(
        repo: FakeCollectionRepo,
        drafts: StopDrafts? = null,
        pending: Flow<Set<String>> = emptyFlow(),
        live: Flow<Unit> = emptyFlow(),
    ): CollectionViewModel {
        var n = 0
        return CollectionViewModel(
            runId = "r1",
            getRun = GetCollectionRun(repo),
            getStop = GetShopStop(repo),
            collectStop = CollectStop(repo),
            checkInHub = CheckInHub(repo),
            newChangeId = { "cid-${n++}" },
            drafts = drafts,
            pendingChangeIds = pending,
            liveChanges = live,
        )
    }

    /**
     * 092 rev 2 — "work changed" while the driver is on a stop: the stop's packages are re-read. A tick
     * on a package still there is kept (it is the work in progress); one on a package dispatch withdrew
     * is dropped, so the collect never names a package the stop no longer has.
     */
    @Test fun work_changed_re_reads_the_open_stop_and_keeps_the_ticks_that_still_apply() = runTest {
        val live = kotlinx.coroutines.flow.MutableSharedFlow<Unit>()
        val repo = FakeCollectionRepo(run = CollectionRun("r1", "active", emptyList())).apply { packages = listOf(pkg("a"), pkg("b"), pkg("c")) }
        val v = vm(repo, live = live).apply { loadRun(); loadStop("s1"); togglePackage("a"); togglePackage("b"); reportPackage("c", "Damaged", null) }
        repo.packages = listOf(pkg("a"), pkg("c"), pkg("d")) // "b" withdrawn, "d" made ready
        live.emit(Unit)
        assertEquals(listOf("a", "c", "d"), v.state.value.stop?.packages?.map { it.key })
        assertEquals(setOf("a"), v.state.value.confirmedPackageIds)
        assertEquals(setOf("c"), v.state.value.reportedPackages.keys)
    }

    /** Backlog C1 — collecting with no signal moves the driver on; it is not an error. */
    @Test fun a_collect_saved_offline_moves_the_driver_on() = runTest {
        val repo = FakeCollectionRepo().apply { offline = true }
        var done = false
        vm(repo).apply { loadStop("s1"); collect("s1") { done = true } }
        assertTrue(done)
    }

    /** Backlog C1 — a retry of the same action is the same write, so the queue cannot hold it twice. */
    @Test fun a_retried_collect_keeps_its_change_id() = runTest {
        val repo = FakeCollectionRepo(fail = AppError.Unavailable)
        val v = vm(repo).apply { loadStop("s1") }
        v.collect("s1") {}
        repo.fail = null
        v.collect("s1") {}
        assertEquals(listOf("cid-0"), repo.changeIds)
    }

    /** Backlog C2 — a check-in with no signal is saved, then read again once it has been sent. */
    @Test fun an_offline_check_in_shows_its_split_once_sent() = runTest {
        val pending = MutableStateFlow(setOf<String>())
        val split = HubSplit(3, 3, 0, 0, emptyList())
        val repo = FakeCollectionRepo(split = split).apply { offline = true }
        val v = vm(repo, pending = pending)

        v.checkIn()
        assertTrue(v.state.value.checkInSending)
        assertNull(v.state.value.hubSplit)

        pending.value = setOf("cid-0")   // queued
        repo.offline = false
        pending.value = emptySet()       // sent
        assertEquals(split, v.state.value.hubSplit)
        assertFalse(v.state.value.checkInSending)
        assertEquals(listOf("cid-0", "cid-0"), repo.changeIds) // the same check-in, asked twice
    }

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

    /** 093 — a package added while the driver was at the counter: the stop stays open and says so. */
    @Test fun a_package_added_meanwhile_keeps_the_stop_open() = runTest {
        val repo = FakeCollectionRepo().apply { packages = listOf(pkg("a")); remaining = 1 }
        val v = vm(repo); v.loadStop("s1")
        repo.packages = listOf(pkg("a"), pkg("b"))
        var done = false
        v.collect("s1") { done = true }
        assertEquals(false, done)
        assertEquals("1 more package was added — collect it before you leave.", v.state.value.message)
        assertEquals(listOf("a", "b"), v.state.value.stop?.packages?.map { it.packageId })
    }

    /** 093 — packages not in the van ride the check-in. */
    @Test fun missing_packages_ride_the_check_in() = runTest {
        val repo = FakeCollectionRepo(split = HubSplit(1, 1, 0))
        val v = vm(repo)
        v.checkIn(emptyList(), listOf("ZZZZZZ"))
        assertEquals(listOf("ZZZZZZ"), repo.missing)
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
            listOf(PackageOutcome("a", true, null, com.effyshopping.driver.mobile.core.scan.HandMethod.MANUAL), PackageOutcome("b", false, "Damaged — box crushed")),
            repo.outcomes,
        )
    }

    /** 092 T026 — a scanned stop says how each package came: scanned, typed, or (unscanned) by hand. */
    @Test fun a_scanned_collect_sends_each_packages_method() = runTest {
        val repo = FakeCollectionRepo().apply {
            packages = listOf(pkg("a").copy(packageCode = "AAAAAA"), pkg("b").copy(packageCode = "BBBBBB"), pkg("c"))
        }
        val v = vm(repo); v.loadStop("s1")
        v.collect("s1", mapOf("AAAAAA" to com.effyshopping.driver.mobile.core.scan.HandMethod.SCAN, "BBBBBB" to com.effyshopping.driver.mobile.core.scan.HandMethod.TYPED)) {}
        assertEquals(
            listOf(com.effyshopping.driver.mobile.core.scan.HandMethod.SCAN, com.effyshopping.driver.mobile.core.scan.HandMethod.TYPED, com.effyshopping.driver.mobile.core.scan.HandMethod.MANUAL),
            repo.outcomes?.map { it.method },
        )
    }

    @Test fun a_scanned_check_in_carries_the_methods() = runTest {
        val repo = FakeCollectionRepo(split = HubSplit(1, 1, 0))
        val v = vm(repo)
        val handed = listOf(com.effyshopping.driver.mobile.core.scan.HandedOver("AAAAAA", com.effyshopping.driver.mobile.core.scan.HandMethod.SCAN))
        v.checkIn(handed)
        assertEquals(handed, repo.handed)
    }

    /** 092 — Undo on a report: the package is neither reported nor ticked, and goes as collected if ticked later. */
    @Test fun undoing_a_report_leaves_the_package_unticked() = runTest {
        val repo = FakeCollectionRepo().apply { packages = listOf(pkg("a"), pkg("b")) }
        val v = vm(repo); v.loadStop("s1")
        v.reportPackage("b", "Missing", null)
        v.withdrawReport("b")
        assertEquals(emptyMap(), v.state.value.reportedPackages)
        assertEquals(emptySet(), v.state.value.confirmedPackageIds)
        v.togglePackage("a"); v.togglePackage("b")
        v.collect("s1") {}
        assertEquals(listOf(PackageOutcome("a", true, null, com.effyshopping.driver.mobile.core.scan.HandMethod.MANUAL), PackageOutcome("b", true, null, com.effyshopping.driver.mobile.core.scan.HandMethod.MANUAL)), repo.outcomes)
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
