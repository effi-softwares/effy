package com.effyshopping.driver.mobile.features.driver.data

import com.effyshopping.driver.mobile.contract.DriverMeDTO
import com.effyshopping.driver.mobile.contract.DutyRequest
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.effyJson
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.core.offline.LastCopies
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DriverRepository
import com.effyshopping.driver.mobile.features.driver.domain.CheckAnswer
import com.effyshopping.driver.mobile.features.driver.domain.CheckItem
import com.effyshopping.driver.mobile.features.driver.domain.VehicleCheckAnswer
import com.effyshopping.driver.mobile.features.driver.domain.VehicleCheckStatus
import com.effyshopping.driver.mobile.contract.VehicleCheckEntry
import com.effyshopping.driver.mobile.contract.VehicleCheckItem
import com.effyshopping.driver.mobile.contract.VehicleCheckRequest
import com.effyshopping.driver.mobile.contract.VehicleCheckResponse
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The driver repository over `edge-api/driver`. [driverApi] is the client built for
 * `DRIVER_API_BASE_URL`, carrying the single access-token bearer. A transport failure becomes
 * `AppError.Network`. The DTO never escapes this layer (Principle VI).
 */
class HttpDriverRepository(
    private val driverApi: HttpClient,
    /** Where the last record is kept, so the app can open with no signal (backlog C3). */
    private val lastCopies: LastCopies? = null,
) : DriverRepository {

    override suspend fun me(): Driver = request {
        val dto = driverApi.get("driver/v1/me").ensureSuccess().body<DriverMeDTO>()
        lastCopies?.put(LastCopies.ME, effyJson.encodeToString(DriverMeDTO.serializer(), dto))
        dto.toDomain()
    }

    override fun lastKnown(): Driver? = lastCopies?.get(LastCopies.ME)?.let { raw ->
        runCatching { effyJson.decodeFromString(DriverMeDTO.serializer(), raw).toDomain() }.getOrNull()
    }

    override suspend fun setDuty(onDuty: Boolean, changeId: String): Driver = request {
        driverApi.post("driver/v1/duty") { setBody(DutyRequest(onDuty = onDuty, changeID = changeId)) }
            .ensureSuccess()
        // The duty response carries only the new status; re-read the record so the UI shows the full,
        // fresh driver (identity is always displayed from the record - Principle IV).
        driverApi.get("driver/v1/me").ensureSuccess().body<DriverMeDTO>().toDomain()
    }

    override suspend fun submitVehicleCheck(changeId: String, answers: List<VehicleCheckAnswer>): VehicleCheckStatus = request {
        val body = VehicleCheckRequest(
            changeID = changeId,
            answers = answers.map { a ->
                VehicleCheckEntry(
                    item = when (a.item) {
                        CheckItem.TYRES -> VehicleCheckItem.Tyres
                        CheckItem.LIGHTS -> VehicleCheckItem.Lights
                        CheckItem.BRAKES -> VehicleCheckItem.Brakes
                        CheckItem.MIRRORS -> VehicleCheckItem.Mirrors
                        CheckItem.COLD_STORAGE -> VehicleCheckItem.ColdStorage
                        CheckItem.BODY -> VehicleCheckItem.Body
                    },
                    answer = when (a.answer) {
                        CheckAnswer.OK -> com.effyshopping.driver.mobile.contract.VehicleCheckAnswer.Ok
                        CheckAnswer.MINOR -> com.effyshopping.driver.mobile.contract.VehicleCheckAnswer.Minor
                        CheckAnswer.UNSAFE -> com.effyshopping.driver.mobile.contract.VehicleCheckAnswer.Unsafe
                    },
                    note = a.note?.trim()?.takeIf { it.isNotEmpty() },
                )
            },
        )
        val r = driverApi.post("driver/v1/vehicle-check") { setBody(body) }.ensureSuccess().body<VehicleCheckResponse>()
        if (r.state == "unsafe") VehicleCheckStatus.UNSAFE else VehicleCheckStatus.OK
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
