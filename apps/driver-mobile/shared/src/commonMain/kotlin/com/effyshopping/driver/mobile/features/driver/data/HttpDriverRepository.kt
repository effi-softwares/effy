package com.effyshopping.driver.mobile.features.driver.data

import com.effyshopping.driver.mobile.contract.DriverMeDTO
import com.effyshopping.driver.mobile.contract.DutyRequest
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DriverRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The driver repository over `edge-api/driver` (049). [driverApi] is the client built for
 * `DRIVER_API_BASE_URL`, carrying the single access-token bearer. A transport failure becomes
 * `AppError.Network`. The DTO never escapes this layer (Principle VI).
 */
class HttpDriverRepository(private val driverApi: HttpClient) : DriverRepository {

    override suspend fun me(): Driver = request {
        driverApi.get("driver/v1/me").ensureSuccess().body<DriverMeDTO>().toDomain()
    }

    override suspend fun setDuty(onDuty: Boolean, changeId: String): Driver = request {
        driverApi.post("driver/v1/duty") { setBody(DutyRequest(onDuty = onDuty, changeID = changeId)) }
            .ensureSuccess()
        // The duty response carries only the new status; re-read the record so the UI shows the full,
        // fresh driver (identity is always displayed from the record — Principle IV).
        driverApi.get("driver/v1/me").ensureSuccess().body<DriverMeDTO>().toDomain()
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
