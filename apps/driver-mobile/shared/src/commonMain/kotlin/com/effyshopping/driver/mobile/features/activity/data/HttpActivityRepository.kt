package com.effyshopping.driver.mobile.features.activity.data

import com.effyshopping.driver.mobile.contract.ActivityItem as ActivityItemDTO
import com.effyshopping.driver.mobile.contract.ActivityReadRequest
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.features.activity.domain.ActivityItem
import com.effyshopping.driver.mobile.features.activity.domain.ActivityRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

class HttpActivityRepository(private val api: HttpClient) : ActivityRepository {

    override suspend fun list(): List<ActivityItem> = request {
        api.get("driver/v1/activity").ensureSuccess().body<List<ActivityItemDTO>>().map { it.toDomain() }
    }

    override suspend fun markRead(ids: List<String>) = request {
        if (ids.isNotEmpty()) {
            api.post("driver/v1/activity/read") { setBody(ActivityReadRequest(ids = ids)) }.ensureSuccess()
        }
        Unit
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

private fun ActivityItemDTO.toDomain() = ActivityItem(
    id = id,
    type = type.value,
    body = body,
    createdAt = createdAt,
    read = read,
    runId = runID,
    dropId = dropID,
)
