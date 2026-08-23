package com.effyshopping.driver.mobile.features.history.data

import com.effyshopping.driver.mobile.contract.HistoryDTO
import com.effyshopping.driver.mobile.contract.HistoryDetailDTO
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.features.history.domain.History
import com.effyshopping.driver.mobile.features.history.domain.HistoryDay
import com.effyshopping.driver.mobile.features.history.domain.HistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.HistoryDropRow
import com.effyshopping.driver.mobile.features.history.domain.HistoryRepository
import com.effyshopping.driver.mobile.features.history.domain.HistoryRunRow
import com.effyshopping.driver.mobile.features.history.domain.ProofRecord
import com.effyshopping.driver.mobile.features.history.domain.TimelineEntry
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

class HttpHistoryRepository(private val api: HttpClient) : HistoryRepository {

    override suspend fun list(): History = request {
        api.get("driver/v1/history").ensureSuccess().body<HistoryDTO>().toDomain()
    }

    override suspend fun detail(kind: String, id: String): HistoryDetail = request {
        api.get("driver/v1/history/$kind/$id").ensureSuccess().body<HistoryDetailDTO>().toDomain()
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

private fun HistoryDTO.toDomain() = History(
    days = days.map { d ->
        HistoryDay(
            date = d.date,
            runs = d.runs.map { HistoryRunRow(it.runID, it.type.value, it.completedAt, it.stopCount.toInt()) },
            drops = d.drops.map { HistoryDropRow(it.dropID, it.orderRef, it.customerSuburb, it.completedAt, it.proofCaptured) },
        )
    },
)

private fun HistoryDetailDTO.toDomain() = HistoryDetail(
    timeline = timeline.map { TimelineEntry(it.status, it.at) },
    proof = proof?.let { ProofRecord(it.method.value, it.mediaURL, it.note, it.capturedAt) },
    addressFull = addressFull,
)
