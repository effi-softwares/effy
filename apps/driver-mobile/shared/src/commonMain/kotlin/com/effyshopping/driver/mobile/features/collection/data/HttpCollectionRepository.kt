package com.effyshopping.driver.mobile.features.collection.data

import com.effyshopping.driver.mobile.contract.CollectRequest
import com.effyshopping.driver.mobile.contract.CollectionIssueKind
import com.effyshopping.driver.mobile.contract.CollectionIssueRequest
import com.effyshopping.driver.mobile.contract.CollectionStopDTO
import com.effyshopping.driver.mobile.contract.CollectionStopStatus
import com.effyshopping.driver.mobile.contract.DriverCollectionRunDTO
import com.effyshopping.driver.mobile.contract.HubCheckinRequest
import com.effyshopping.driver.mobile.contract.HubCheckinResponse
import com.effyshopping.driver.mobile.contract.PackageMethod as DtoMethod
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.features.collection.domain.CollectionPackage
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRepository
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.CollectionStop
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.ManifestLine
import com.effyshopping.driver.mobile.features.collection.domain.PackageMethod
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

class HttpCollectionRepository(private val api: HttpClient) : CollectionRepository {

    override suspend fun getRun(runId: String): CollectionRun = request {
        api.get("driver/v1/collection/runs/$runId").ensureSuccess().body<DriverCollectionRunDTO>().toDomain()
    }

    override suspend fun getStop(runId: String, stopId: String): ShopStop = request {
        api.get("driver/v1/collection/runs/$runId/stops/$stopId").ensureSuccess().body<CollectionStopDTO>().toDomain()
    }

    override suspend fun collect(runId: String, stopId: String, changeId: String) = request {
        api.post("driver/v1/collection/runs/$runId/stops/$stopId/collect") { setBody(CollectRequest(changeID = changeId)) }
            .ensureSuccess()
        Unit
    }

    override suspend fun reportIssue(runId: String, stopId: String, kind: String, note: String?, changeId: String) = request {
        val k = if (kind == "missing") CollectionIssueKind.Missing else CollectionIssueKind.KindShort
        api.post("driver/v1/collection/runs/$runId/stops/$stopId/issue") {
            setBody(CollectionIssueRequest(changeID = changeId, kind = k, note = note, shopFulfillmentID = null))
        }.ensureSuccess()
        Unit
    }

    override suspend fun checkIn(runId: String, changeId: String): HubSplit = request {
        val r = api.post("driver/v1/hub/checkin") { setBody(HubCheckinRequest(changeID = changeId, runID = runId)) }
            .ensureSuccess().body<HubCheckinResponse>()
        HubSplit(r.scannedTotal.toInt(), r.sameDayCount.toInt(), r.standardCount.toInt())
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
        CollectionStop(it.stopID, it.sequence.toInt(), it.shopName, it.shopCode, it.packageCount.toInt(), stopStatus(it.status))
    },
)

private fun CollectionStopDTO.toDomain() = ShopStop(
    stopId = stopID,
    shopName = shopName,
    shopCode = shopCode,
    packages = packages.map { p ->
        CollectionPackage(p.ref, p.destinationSuburb, method(p.method), p.items.map { ManifestLine(it.name, it.qty.toInt()) })
    },
    status = stopStatus(status),
)
