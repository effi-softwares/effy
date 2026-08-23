package com.effyshopping.driver.mobile.features.today.data

import com.effyshopping.driver.mobile.contract.DriverPhase
import com.effyshopping.driver.mobile.contract.TodayDTO
import com.effyshopping.driver.mobile.contract.TodayItemRef
import com.effyshopping.driver.mobile.contract.TodayItemRefKind
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.domain.Today
import com.effyshopping.driver.mobile.features.today.domain.TodayItem
import com.effyshopping.driver.mobile.features.today.domain.TodayRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/** The Today repository over `edge-api/driver` (049). The DTO never escapes this layer (Principle VI). */
class HttpTodayRepository(private val driverApi: HttpClient) : TodayRepository {

    override suspend fun today(): Today =
        try {
            driverApi.get("driver/v1/today").ensureSuccess().body<TodayDTO>().toDomain()
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

private fun TodayDTO.toDomain(): Today = Today(
    phase = when (phase) {
        DriverPhase.Collection -> Phase.COLLECTION
        DriverPhase.SameDayDelivery -> Phase.SAME_DAY_DELIVERY
        DriverPhase.Idle -> Phase.IDLE
    },
    activeRunId = activeRunID,
    active = active?.toDomain(),
    upNext = upNext.map { it.toDomain() },
    remainingCount = remainingCount.toInt(),
)

private fun TodayItemRef.toDomain(): TodayItem = TodayItem(
    kind = when (kind) {
        TodayItemRefKind.CollectionStop -> TodayItem.Kind.COLLECTION_STOP
        TodayItemRefKind.DeliveryDrop -> TodayItem.Kind.DELIVERY_DROP
    },
    id = id,
    runId = runID,
    title = title,
    subtitle = subtitle,
    status = status,
)
