package com.effyshopping.driver.mobile.features.collection.data

import com.effyshopping.driver.mobile.core.scan.toWire
import com.effyshopping.driver.mobile.core.map.toDomain
import com.effyshopping.driver.mobile.contract.CollectRequest
import com.effyshopping.driver.mobile.contract.Outcome
import com.effyshopping.driver.mobile.contract.Package as CollectPackage
import com.effyshopping.driver.mobile.contract.CollectionStopDTO
import com.effyshopping.driver.mobile.contract.CollectionStopStatus
import com.effyshopping.driver.mobile.contract.DriverCollectionRunDTO
import com.effyshopping.driver.mobile.contract.HubCheckinRequest
import com.effyshopping.driver.mobile.contract.HubCheckinResponse
import com.effyshopping.driver.mobile.contract.DeliveredBy as DtoDeliveredBy
import com.effyshopping.driver.mobile.contract.PackageMethod as DtoMethod
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.core.offline.LastRead
import com.effyshopping.driver.mobile.core.offline.OfflineQueue
import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.core.offline.withReplay
import kotlinx.serialization.json.Json
import com.effyshopping.driver.mobile.core.opening.toOpening
import com.effyshopping.driver.mobile.features.collection.domain.CollectionPackage
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRepository
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.CollectionStop
import com.effyshopping.driver.mobile.features.collection.domain.EffyGroup
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.HubSort
import com.effyshopping.driver.mobile.features.collection.domain.HubSortKind
import com.effyshopping.driver.mobile.features.manifest.data.toDomain
import com.effyshopping.driver.mobile.features.collection.domain.PackageMethod
import com.effyshopping.driver.mobile.features.collection.domain.PackageOutcome
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

class HttpCollectionRepository(
    private val api: HttpClient,
    private val offline: OfflineQueue,
    private val json: Json = Json { encodeDefaults = true },
) : CollectionRepository {

    override suspend fun getRun(runId: String): CollectionRun = request {
        api.get("driver/v1/collection/runs/$runId").ensureSuccess().body<DriverCollectionRunDTO>().toDomain()
    }

    /** 065 FR-024 — a stop the driver has already seen stays readable with no connection. */
    private val lastStops = LastRead<String, ShopStop> { it.copy(stale = true) }

    override suspend fun getStop(runId: String, stopId: String): ShopStop = lastStops.fetch(stopId) {
        request {
            api.get("driver/v1/collection/runs/$runId/stops/$stopId").ensureSuccess().body<CollectionStopDTO>().toDomain()
        }
    }

    override suspend fun collect(runId: String, stopId: String, changeId: String, outcomes: List<PackageOutcome>): WriteOutcome {
        val path = "driver/v1/collection/runs/$runId/stops/$stopId/collect"
        // ⚠ Each package's outcome travels IN the collect (063 FR-026). The separate `/issue` call
        // this app used to make named no package, and the platform reads "no package" as "every
        // package at this stop" — one report marked the whole stop unavailable.
        val body = CollectRequest(
            changeID = changeId,
            packages = outcomes.takeIf { it.isNotEmpty() }?.map {
                CollectPackage(
                    method = it.method?.toWire(),
                    note = it.note,
                    outcome = if (it.collected) Outcome.PickedUp else Outcome.NotAvailable,
                    packageID = it.packageId,
                )
            },
        )
        return request {
            offline.withReplay(path, json.encodeToString(CollectRequest.serializer(), body), changeId, "Collect a shop stop", queued = { WriteOutcome.QUEUED }) {
                api.post(path) { setBody(body) }.ensureSuccess()
                WriteOutcome.SENT
            }
        }
    }

    override suspend fun checkIn(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>): HubSplit? {
        val path = "driver/v1/hub/checkin"
        val body = HubCheckinRequest(changeID = changeId, runID = runId, packages = handed.toWire())
        return request {
            offline.withReplay(path, json.encodeToString(HubCheckinRequest.serializer(), body), changeId, "Hub check-in", queued = { null }) {
                val r = api.post(path) { setBody(body) }.ensureSuccess().body<HubCheckinResponse>()
                HubSplit(
                    r.scannedTotal.toInt(), r.sameDayCount.toInt(), r.standardCount.toInt(), r.courierCount?.toInt(),
                    // 082 — null from a server that predates it; the domain falls back to the counts above.
                    r.effyGroups?.map { g -> EffyGroup(g.label, g.count.toInt(), g.dueToday) },
                    nextCourierPickupLabel = r.nextCourierPickupLabel?.takeIf { it.isNotBlank() },
                )
            }
        }
    }

    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            throw e
        } catch (e: IOException) {
            throw AppException(AppError.Network)
        } catch (e: UnresolvedAddressException) {
            throw AppException(AppError.Network)
        } catch (e: Throwable) {
            throw AppException(AppError.Unexpected)
        }
}

private fun stopStatus(s: CollectionStopStatus): StopStatus = when (s) {
    CollectionStopStatus.Assigned -> StopStatus.ASSIGNED
    CollectionStopStatus.EnRoute -> StopStatus.EN_ROUTE
    CollectionStopStatus.Collected -> StopStatus.COLLECTED
    CollectionStopStatus.CollectionStopStatusShort -> StopStatus.SHORT
}

private fun method(m: DtoMethod): PackageMethod =
    if (m == DtoMethod.SameDay) PackageMethod.SAME_DAY else PackageMethod.STANDARD

private fun DriverCollectionRunDTO.toDomain() = CollectionRun(
    runId = runID,
    status = status,
    stops = stops.map {
        CollectionStop(
            it.stopID, it.sequence.toInt(), it.shopName, it.shopCode, it.packageCount.toInt(), stopStatus(it.status), it.address,
            packageCodes = it.packageCodes.orEmpty(),
        )
    },
    opening = opening.toOpening(),
    dueLabel = dueLabel,
    hubSort = hubSort.orEmpty().map { HubSort(it.packageCode, hubSortKind(it.kind), it.label) },
    map = map?.toDomain(),
)

/** Never fails on a kind this build does not know — the label still says what to do. */
private fun hubSortKind(kind: String): HubSortKind = when (kind) {
    "load_now" -> HubSortKind.LOAD_NOW
    "shelve" -> HubSortKind.SHELVE
    "courier_bay" -> HubSortKind.COURIER_BAY
    else -> HubSortKind.UNKNOWN
}

private fun CollectionStopDTO.toDomain() = ShopStop(
    stopId = stopID,
    shopName = shopName,
    shopCode = shopCode,
    packages = packages.map { p ->
        CollectionPackage(
            p.ref, p.destinationSuburb, method(p.method), p.items.map { it.toDomain() }, p.summary.toDomain(),
            toCourier = p.deliveredBy?.let { it == DtoDeliveredBy.Courier },
            windowLabel = p.windowLabel,
            packageId = p.packageID,
            packageCode = p.packageCode,
        )
    },
    status = stopStatus(status),
    opening = opening.toOpening(),
    address = address,
)
