package com.effyshopping.driver.mobile.features.collection.domain

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
) {
    val allCollected: Boolean get() = stops.isNotEmpty() && stops.all { it.status == StopStatus.COLLECTED || it.status == StopStatus.SHORT }
}

data class ManifestLine(val name: String, val qty: Int)

data class CollectionPackage(
    val ref: String,
    val destinationSuburb: String,
    val method: PackageMethod,
    val items: List<ManifestLine>,
)

data class ShopStop(
    val stopId: String,
    val shopName: String,
    val shopCode: String,
    val packages: List<CollectionPackage>,
    val status: StopStatus,
)

/** The same-day/standard split returned by hub check-in (FR-016). */
data class HubSplit(val scannedTotal: Int, val sameDayCount: Int, val standardCount: Int)

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
