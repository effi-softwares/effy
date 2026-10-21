package com.effyshopping.driver.mobile.features.collection.domain

import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.core.opening.Opening
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.manifest.domain.ManifestLine

/** Collection-run domain (049 US1). DTOs are mapped to these and never leak past the data layer. */

enum class StopStatus { ASSIGNED, EN_ROUTE, COLLECTED, SHORT }
enum class PackageMethod { SAME_DAY, STANDARD }

data class CollectionStop(
    val stopId: String,
    val sequence: Int,
    val shopName: String,
    val shopCode: String,
    val packageCount: Int,
    val status: StopStatus,
    /** 063 — the shop's street address in one line; null when the shop has none. */
    val address: String? = null,
    /** 089 — the codes on this stop's package labels; empty from an older server. */
    val packageCodes: List<String> = emptyList(),
    /** 096 — every bag of this stop's packages; empty from an older server. */
    val bags: List<com.effyshopping.driver.mobile.core.scan.Bag> = emptyList(),
) {
    /** The bags to count here: the server's, or one per package code from an older server. */
    val bagCodes: List<String> get() = bags.map { it.code }.ifEmpty { packageCodes }
}

/** 090 — where a package goes at the hub. [UNKNOWN] is a kind this build does not know: show the label. */
enum class HubSortKind { LOAD_NOW, SHELVE, COURIER_BAY, UNKNOWN }

/** 090 — one package's hub instruction, in the platform's words ([label] is the whole line). */
data class HubSort(
    val packageCode: String,
    val kind: HubSortKind,
    val label: String,
    /** 096 — every bag of the package; each gets this instruction. */
    val bagCodes: List<String> = emptyList(),
)

data class CollectionRun(
    val runId: String,
    val status: String,
    val stops: List<CollectionStop>,
    /** 072 — when the round opens; null = open. Nothing on it can be collected before then. */
    val opening: Opening? = null,
    /** 072 — the collection run's time, in the server's words: when collecting must be finished. */
    val dueLabel: String? = null,
    /** 090 — every package's hub instruction, for the hub scan; empty from an older server. */
    val hubSort: List<HubSort> = emptyList(),
    /** 092 rev 2 — the run map. */
    val map: com.effyshopping.driver.mobile.core.map.RunMap? = null,
) {
    val allCollected: Boolean get() = stops.isNotEmpty() && stops.all { it.status == StopStatus.COLLECTED || it.status == StopStatus.SHORT }
}

data class CollectionPackage(
    val ref: String,
    val destinationSuburb: String,
    /** Routing only since 082 — never shown. [toCourier] and [windowLabel] are what the screen says. */
    val method: PackageMethod,
    /** ⚠ This package's OWN lines (065) — not the stop's. */
    val items: List<ManifestLine>,
    val summary: ClassSummary,
    /**
     * 082 — a courier takes it from the hub. Null from a server older than 082; the screen then falls
     * back to the method (a parcel that is not same-day went to a carrier, as it did then).
     */
    val toCourier: Boolean? = null,
    /** 082 — the day and window an Effy parcel is for, in the server's words; null when none. */
    val windowLabel: String? = null,
    /**
     * The package's own id — what a collect names when it says which package was left behind. Null
     * from a server that does not send it yet; such a package cannot be reported from the app.
     */
    val packageId: String? = null,
    /** 089 — the code on this package's label; null from an older server. */
    val packageCode: String? = null,
    /** 096 — this package's bags, each with its own code. */
    val bags: List<com.effyshopping.driver.mobile.core.scan.Bag> = emptyList(),
) {
    /** 096 — the bags to count (one, carrying the package code, from an older server). */
    val allBags: List<com.effyshopping.driver.mobile.core.scan.Bag> get() = com.effyshopping.driver.mobile.core.scan.bagsOrPackage(bags, packageCode)

    /** What the screen keys a package's tick or report by. */
    val key: String get() = packageId ?: ref
    /** Who takes it from the hub, in the two words a driver reads (082). */
    val goesToCourier: Boolean get() = toCourier ?: (method != PackageMethod.SAME_DAY)
}

data class ShopStop(
    val stopId: String,
    val shopName: String,
    val shopCode: String,
    val packages: List<CollectionPackage>,
    val status: StopStatus,
    /** 072 — when this stop's round opens; null = open. */
    val opening: Opening? = null,
    /** 063 — the shop's street address in one line; null when the shop has none. */
    val address: String? = null,
    /**
     * 065 — true when this is the LAST LOADED copy, served because the device has no connection.
     * The items are real; anything the shop changed since is not reflected, and the screen says so.
     */
    val stale: Boolean = false,
)

/**
 * The split returned by hub check-in (FR-016), as the driver reads it since 082: parcels EFFY delivers
 * — grouped by the day and window each is for — and parcels a COURIER takes from the hub. The driver
 * classifies nothing.
 *
 * [sameDayCount] / [standardCount] are what this app was built on. [courierCount] is null from a
 * server older than 080 and [effyGroups] from one older than 082; the screen then falls back to them.
 */
data class HubSplit(
    val scannedTotal: Int,
    val sameDayCount: Int,
    val standardCount: Int,
    val courierCount: Int? = null,
    val effyGroups: List<EffyGroup>? = null,
    /** 092 — when the courier next collects from the hub, in the server's words; null when not known. */
    val nextCourierPickupLabel: String? = null,
    /** 093 — packages declared not in the van, now held for dispatch. */
    val held: Int = 0,
) {
    /** How many go to a courier — never called "standard" on screen (080). */
    val toCourier: Int get() = courierCount ?: standardCount

    /** Effy's parcels, by day and window. From an older server: one group, today's. */
    val effy: List<EffyGroup> get() = effyGroups
        ?: if (sameDayCount > 0) listOf(EffyGroup(label = "Today", count = sameDayCount, dueToday = true)) else emptyList()

    /** How many Effy delivers, on any day. */
    val effyCount: Int get() = effy.sumOf { it.count }

    /** How many this driver loads now for a delivery round; the rest are shelved for a later day. */
    val dueToday: Int get() = effy.filter { it.dueToday }.sumOf { it.count }
}

/**
 * 082 — the Effy parcels of one check-in that wait for one day and window. [label] is the server's
 * ("Today, 4 pm – 6 pm", "Thu 15 Oct, 10 am – 12 pm"): this app never formats a day.
 */
data class EffyGroup(val label: String, val count: Int, val dueToday: Boolean)

/**
 * What happened to one package at a stop, sent WITH the collect (063 FR-026) so the platform never
 * believes a package is in the van when it was left at the shop.
 */
data class PackageOutcome(
    val packageId: String,
    val collected: Boolean,
    val note: String? = null,
)
/**
 * 093 — a collect's answer: sent or saved, and how many packages at the stop it did NOT name (added while
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
        /** 096 — every bag of every collected package, and how it was handed over. */
        handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(),
        /** 096 — bags of collected packages that were not at the shop. */
        missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag> = emptyList(),
    ): Collected
    /**
     * Null when there was no signal: the check-in is saved to send, and its answer comes later.
     * 093 — [missing]: label codes of collected packages that are not in the van (held for dispatch).
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

/** What the driver has ticked and reported at ONE stop, before the swipe sends it. */
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
 * ⚠ Ticks and reports lived in memory only. A phone that reclaimed the app while the driver was
 * carrying boxes lost every "this one is missing" they had entered, and the swipe then recorded
 * those packages as collected. One stop at a time: it is the stop in front of the driver.
 */
interface StopDrafts {
    fun load(runId: String, stopId: String): StopDraft?
    fun save(runId: String, draft: StopDraft)
    fun clear()
}
