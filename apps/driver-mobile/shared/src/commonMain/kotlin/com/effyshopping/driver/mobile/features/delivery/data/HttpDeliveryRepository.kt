package com.effyshopping.driver.mobile.features.delivery.data

import com.effyshopping.driver.mobile.contract.DeliveryDropDTO
import com.effyshopping.driver.mobile.contract.DeliveryDropStatus
import com.effyshopping.driver.mobile.contract.DeliveryFailureReason
import com.effyshopping.driver.mobile.contract.DeliveryRunDTO
import com.effyshopping.driver.mobile.contract.DropFailRequest
import com.effyshopping.driver.mobile.contract.DropStatusRequest
import com.effyshopping.driver.mobile.contract.ProofMethod as DtoProofMethod
import com.effyshopping.driver.mobile.contract.ProofRequest
import com.effyshopping.driver.mobile.contract.To
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropPackage
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

class HttpDeliveryRepository(private val api: HttpClient) : DeliveryRepository {

    override suspend fun getRun(runId: String): DeliveryRun = request {
        api.get("driver/v1/delivery/runs/$runId").ensureSuccess().body<DeliveryRunDTO>().toDomain()
    }

    override suspend fun getDrop(dropId: String): Drop = request {
        api.get("driver/v1/delivery/drops/$dropId").ensureSuccess().body<DeliveryDropDTO>().toDomain()
    }

    override suspend fun advance(dropId: String, to: String, changeId: String): DropStatus = request {
        val toEnum = when (to) {
            "out_for_delivery" -> To.OutForDelivery
            "en_route" -> To.EnRoute
            else -> To.Arrived
        }
        val r = api.post("driver/v1/delivery/drops/$dropId/status") {
            setBody(DropStatusRequest(changeID = changeId, to = toEnum))
        }.ensureSuccess().body<StatusResp>()
        dropStatus(r.status)
    }

    override suspend fun completeWithCode(dropId: String, code: String, note: String?, changeId: String) = request {
        api.post("driver/v1/delivery/drops/$dropId/proof") {
            setBody(ProofRequest(changeID = changeId, method = DtoProofMethod.Code, code = code, note = note))
        }.ensureSuccess()
        Unit
    }

    override suspend fun completeContactless(dropId: String, note: String?, changeId: String) = request {
        api.post("driver/v1/delivery/drops/$dropId/proof") {
            setBody(ProofRequest(changeID = changeId, method = DtoProofMethod.Contactless, note = note))
        }.ensureSuccess()
        Unit
    }

    override suspend fun fail(dropId: String, reason: FailureReason, note: String?, changeId: String) = request {
        api.post("driver/v1/delivery/drops/$dropId/fail") {
            setBody(DropFailRequest(changeID = changeId, reason = failureReason(reason), note = note))
        }.ensureSuccess()
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

@kotlinx.serialization.Serializable
private data class StatusResp(val status: DeliveryDropStatus)

private fun dropStatus(s: DeliveryDropStatus): DropStatus = when (s) {
    DeliveryDropStatus.Staged -> DropStatus.STAGED
    DeliveryDropStatus.OutForDelivery -> DropStatus.OUT_FOR_DELIVERY
    DeliveryDropStatus.EnRoute -> DropStatus.EN_ROUTE
    DeliveryDropStatus.Arrived -> DropStatus.ARRIVED
    DeliveryDropStatus.Delivered -> DropStatus.DELIVERED
    DeliveryDropStatus.Failed -> DropStatus.FAILED
}

private fun failureReason(r: FailureReason): DeliveryFailureReason = when (r) {
    FailureReason.NOBODY_HOME -> DeliveryFailureReason.NobodyHome
    FailureReason.WRONG_ADDRESS -> DeliveryFailureReason.WrongAddress
    FailureReason.CUSTOMER_REFUSED -> DeliveryFailureReason.CustomerRefused
    FailureReason.ACCESS_BLOCKED -> DeliveryFailureReason.AccessBlocked
    FailureReason.OTHER -> DeliveryFailureReason.Other
}

private fun DeliveryRunDTO.toDomain() = DeliveryRun(
    runId = runID,
    status = status,
    drops = drops.map {
        DropSummary(it.dropID, it.sequence.toInt(), it.orderRef, it.customerSuburb, it.packageCount.toInt(), dropStatus(it.status))
    },
)

private fun DeliveryDropDTO.toDomain() = Drop(
    dropId = dropID,
    orderRef = orderRef,
    customerName = customerName,
    addressFull = addressFull,
    instructions = instructions,
    packages = packages.map { DropPackage(it.ref, it.fromShopCount.toInt()) },
    status = dropStatus(status),
)
