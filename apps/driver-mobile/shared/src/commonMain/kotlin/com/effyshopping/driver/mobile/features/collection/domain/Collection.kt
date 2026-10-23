package com.effyshopping.driver.mobile.features.collection.domain

import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.core.opening.Opening
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.manifest.domain.ManifestLine

/** Collection-run domain. DTOs are mapped to these and never leak past the data layer. */

enum class StopStatus { ASSIGNED, EN_ROUTE, COLLECTED, SHORT }

data class CollectionStop(
    val stopId: String,
    val sequence: Int,
    val shopName: String,
    val shopCode: String,
    val packageCount: Int,
    val status: StopStatus,
    /** The shop's street address in one line; null when the shop has none. */
    val address: String? = null,
    /** Every bag of this stop's packages. */
    val bags: List<com.effyshopping.driver.mobile.core.scan.Bag> = emptyList(),
) {
    val bagCodes: List<String> get() = bags.map { it.code }
}

/** Where a package goes at the hub. [unknown] is a kind this build does not know: show the label. */
enum class HubSortKind { LOAD_NOW, SHELVE, COURIER_BAY, UNKNOWN }

/** One package's hub instruction, in the platform's words ([label] is the whole line). */
data class HubSort(
    val packageCode: String,
    val kind: HubSortKind,
    val label: String,
    /** Every bag of the package; each gets this instruction. */
    val bagCodes: List<String> = emptyList(),
)

data class CollectionRun(
    val runId: String,
    val status: String,
    val stops: List<CollectionStop>,
    /** When the round opens; null = open. Nothing on it can be collected before then. */
    val opening: Opening? = null,
    /** The collection run's time, in the server's words: when collecting must be finished. */
    val dueLabel: String? = null,
    /** Every package's hub instruction, for the hub scan; empty from an older server. */
    val hubSort: List<HubSort> = emptyList(),
    /** Rev 2 — the run map. */
    val map: com.effyshopping.driver.mobile.core.map.RunMap? = null,
) {
    val allCollected: Boolean get() = stops.isNotEmpty() && stops.all { it.status == StopStatus.COLLECTED || it.status == StopStatus.SHORT }
}

data class CollectionPackage(
    val ref: String,
    val destinationSuburb: String,
    /** This package's own lines — not the stop's. */
    val items: List<ManifestLine>,
    val summary: ClassSummary,
    /** A courier takes it from the hub; otherwise Effy delivers it. */
    val goesToCourier: Boolean,
    /** The package's own id — what a collect names when it says which package was left behind. */
    val packageId: String,
    /** The code on this package's label: bag 1's. */
    val packageCode: String,
    /** This package's bags, each with its own code. */
    val bags: List<com.effyshopping.driver.mobile.core.scan.Bag>,
    /** The day and window an Effy parcel is for, in the server's words; null when none. */
    val windowLabel: String? = null,
) {
    /** What the screen keys a package's tick or report by. */
    val key: String get() = packageId
}

data class ShopStop(
    val stopId: String,
    val shopName: String,
    val shopCode: String,
    val packages: List<CollectionPackage>,
    val status: StopStatus,
    /** When this stop's round opens; null = open. */
    val opening: Opening? = null,
    /** The shop's street address in one line; null when the shop has none. */
    val address: String? = null,
    /**
     * True when this is the last loaded copy, served because the device has no connection.
     * The items are real; anything the shop changed since is not reflected, and the screen says so.
     */
    val stale: Boolean = false,
)

/**
 * The split returned by hub check-in: parcels Effy delivers — grouped by the day and window
 * each is for — and parcels a courier takes from the hub. The driver classifies nothing.
 */
data class HubSplit(
    val scannedTotal: Int,
    /** How many go to a courier — never called "standard" on screen. */
    val toCourier: Int,
    /** Effy's parcels, by day and window. */
    val effy: List<EffyGroup>,
    /** When the courier next collects from the hub, in the server's words; null when not known. */
    val nextCourierPickupLabel: String? = null,
    /** Packages declared not in the van, now held for dispatch. */
    val held: Int = 0,
) {
    /** How many Effy delivers, on any day. */
    val effyCount: Int get() = effy.sumOf { it.count }

    /** How many this driver loads now for a delivery round; the rest are shelved for a later day. */
    val dueToday: Int get() = effy.filter { it.dueToday }.sumOf { it.count }
}

/**
 * The Effy parcels of one check-in that wait for one day and window. [label] is the server's
 * ("Today, 4 pm – 6 pm", "Thu 15 Oct, 10 am – 12 pm"): this app never formats a day.
 */
data class EffyGroup(val label: String, val count: Int, val dueToday: Boolean)

/**
 * What happened to one package at a stop, sent with the collect so the platform never
 * believes a package is in the van when it was left at the shop.
 */
data class PackageOutcome(
    val packageId: String,
    val collected: Boolean,
    val note: String? = null,
)
/**
 * A collect's answer: sent or saved, and how many packages at the stop it did not name (added while
 * the driver was there). Those are still waiting and the stop is still open. 0 when saved with no signal.
 */
data class Collected(val outcome: WriteOutcome, val remaining: Int = 0)

interface CollectionRepository {
    suspend fun getRun(runId: String): CollectionRun
    suspend fun getStop(runId: String, stopId: String): ShopStop
    /** [outcomes] — every package the driver was shown, each collected or not. 093: only these are settled. */
    suspend fun collect(
        runId: String,
        stopId: String,
        changeId: String,
        outcomes: List<PackageOutcome> = emptyList(),
        /** Every bag of every collected package, and how it was handed over. */
        handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(),
        /** Bags of collected packages that were not at the shop. */
        missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag> = emptyList(),
    ): Collected
    /**
     * Null when there was no signal: the check-in is saved to send, and its answer comes later.
     * [missing]: label codes of collected packages that are not in the van (held for dispatch).
     */
    suspend fun checkIn(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(), missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag> = emptyList()): HubSplit?
}

class GetCollectionRun(private val repo: CollectionRepository) {
    suspend operator fun invoke(runId: String) = repo.getRun(runId)
}
class GetShopStop(private val repo: CollectionRepository) {
    suspend operator fun invoke(runId: String, stopId: String) = repo.getStop(runId, stopId)
}
class CollectStop(private val repo: CollectionRepository) {
    suspend operator fun invoke(
        runId: String,
        stopId: String,
        changeId: String,
        outcomes: List<PackageOutcome> = emptyList(),
        handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(),
        missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag> = emptyList(),
    ) = repo.collect(runId, stopId, changeId, outcomes, handed, missing)
}
class CheckInHub(private val repo: CollectionRepository) {
    suspend operator fun invoke(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(), missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag> = emptyList()) =
        repo.checkIn(runId, changeId, handed, missing)
}

/** What the driver has ticked and reported at one stop, before the swipe sends it. */
data class StopDraft(
    val stopId: String,
    val confirmed: Set<String>,
    /** Package key → what the driver said is wrong, in the words sent with the collect. */
    val reported: Map<String, ReportedProblem>,
)

data class ReportedProblem(val kind: String, val note: String?)

/**
 * Keeps the stop the driver is working on across the app being closed.
 *
 * Ticks and reports lived in memory only. A phone that reclaimed the app while the driver was
 * carrying boxes lost every "this one is missing" they had entered, and the swipe then recorded
 * those packages as collected. One stop at a time: it is the stop in front of the driver.
 */
interface StopDrafts {
    fun load(runId: String, stopId: String): StopDraft?
    fun save(runId: String, draft: StopDraft)
    fun clear()
}
