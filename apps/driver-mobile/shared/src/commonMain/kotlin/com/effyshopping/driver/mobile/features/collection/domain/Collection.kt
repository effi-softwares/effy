package com.effyshopping.driver.mobile.features.collection.domain

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
)

data class CollectionRun(
    val runId: String,
    val status: String,
    val stops: List<CollectionStop>,
    /** 072 — when the round opens; null = open. Nothing on it can be collected before then. */
    val opening: Opening? = null,
    /** 072 — the collection run's time, in the server's words: when collecting must be finished. */
    val dueLabel: String? = null,
) {
    val allCollected: Boolean get() = stops.isNotEmpty() && stops.all { it.status == StopStatus.COLLECTED || it.status == StopStatus.SHORT }
}

data class CollectionPackage(
    val ref: String,
    val destinationSuburb: String,
    val method: PackageMethod,
    /** ⚠ This package's OWN lines (065) — not the stop's. */
    val items: List<ManifestLine>,
    val summary: ClassSummary,
)

data class ShopStop(
    val stopId: String,
    val shopName: String,
    val shopCode: String,
    val packages: List<CollectionPackage>,
    val status: StopStatus,
    /** 072 — when this stop's round opens; null = open. */
    val opening: Opening? = null,
    /**
     * 065 — true when this is the LAST LOADED copy, served because the device has no connection.
     * The items are real; anything the shop changed since is not reflected, and the screen says so.
     */
    val stale: Boolean = false,
)

/**
 * The split returned by hub check-in (FR-016): same-day parcels to deliver, and (080) parcels a
 * COURIER takes from the hub. [standardCount] is what this app was built on; [courierCount] is null
 * from a server older than 080, and the screen then falls back to it.
 */
data class HubSplit(val scannedTotal: Int, val sameDayCount: Int, val standardCount: Int, val courierCount: Int? = null) {
    /** How many go to a courier — never called "standard" on screen (080). */
    val toCourier: Int get() = courierCount ?: standardCount
}

interface CollectionRepository {
    suspend fun getRun(runId: String): CollectionRun
    suspend fun getStop(runId: String, stopId: String): ShopStop
    suspend fun collect(runId: String, stopId: String, changeId: String)
    suspend fun reportIssue(runId: String, stopId: String, kind: String, note: String?, changeId: String)
    suspend fun checkIn(runId: String, changeId: String): HubSplit
}

class GetCollectionRun(private val repo: CollectionRepository) {
    suspend operator fun invoke(runId: String) = repo.getRun(runId)
}
class GetShopStop(private val repo: CollectionRepository) {
    suspend operator fun invoke(runId: String, stopId: String) = repo.getStop(runId, stopId)
}
class CollectStop(private val repo: CollectionRepository) {
    suspend operator fun invoke(runId: String, stopId: String, changeId: String) = repo.collect(runId, stopId, changeId)
}
class ReportCollectionIssue(private val repo: CollectionRepository) {
    suspend operator fun invoke(runId: String, stopId: String, kind: String, note: String?, changeId: String) =
        repo.reportIssue(runId, stopId, kind, note, changeId)
}
class CheckInHub(private val repo: CollectionRepository) {
    suspend operator fun invoke(runId: String, changeId: String) = repo.checkIn(runId, changeId)
}
