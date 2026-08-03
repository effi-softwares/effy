package com.effyshopping.customer.mobile.features.account.data

import com.effyshopping.customer.mobile.contract.ClosureBlockerDTO
import com.effyshopping.customer.mobile.contract.ClosureBlockerKind as ClosureBlockerKindDTO
import com.effyshopping.customer.mobile.contract.ClosureChallengeResultDTO
import com.effyshopping.customer.mobile.contract.ClosurePreviewDTO
import com.effyshopping.customer.mobile.contract.ClosureRequestDTO
import com.effyshopping.customer.mobile.contract.ClosureResultDTO
import com.effyshopping.customer.mobile.contract.RetainedCategoryDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.account.domain.ActiveClosureRequest
import com.effyshopping.customer.mobile.features.account.domain.ClosureBlocker
import com.effyshopping.customer.mobile.features.account.domain.ClosureBlockerKind
import com.effyshopping.customer.mobile.features.account.domain.ClosurePreview
import com.effyshopping.customer.mobile.features.account.domain.ClosureRepository
import com.effyshopping.customer.mobile.features.account.domain.RetainedCategory
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * Account closure over the edge API (034 US3).
 *
 * ⚠ The DTO never escapes this layer (Principle VI) — the domain gets [ClosurePreview], which
 * deliberately makes a blocker's `clearsAt` non-null so a block with no stated end cannot be built.
 */
class HttpClosureRepository(private val edge: HttpClient) : ClosureRepository {

    override suspend fun preview(): ClosurePreview = request {
        edge.get("customer/v1/closure").ensureSuccess().body<ClosurePreviewDTO>().toDomain()
    }

    override suspend fun requestCode(): String = request {
        edge.post("customer/v1/closure/challenge")
            .ensureSuccess().body<ClosureChallengeResultDTO>().maskedDestination
    }

    override suspend fun close(code: String): String = request {
        edge.post("customer/v1/closure") {
            setBody(ClosureRequestDTO(code = code))
        }.ensureSuccess().body<ClosureResultDTO>().eraseAfter
    }

    override suspend fun restore(): Unit = request {
        edge.post("customer/v1/closure/restore").ensureSuccess()
    }

    private suspend inline fun <T> request(block: () -> T): T = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: AppException) {
        throw e
    } catch (e: UnresolvedAddressException) {
        throw AppException(AppError.Network)
    } catch (e: IOException) {
        throw AppException(AppError.Network)
    }
}

private fun ClosurePreviewDTO.toDomain() = ClosurePreview(
    blockers = blockers.map { it.toDomain() },
    retained = retained.map { it.toDomain() },
    eraseAfterIfRequestedNowIso = eraseAfterIfRequestedNow,
    activeRequest = activeRequest?.let {
        ActiveClosureRequest(requestedAtIso = it.requestedAt, eraseAfterIso = it.eraseAfter)
    },
)

private fun ClosureBlockerDTO.toDomain() = ClosureBlocker(
    kind = when (kind) {
        ClosureBlockerKindDTO.OrderAwaitingPayment -> ClosureBlockerKind.ORDER_AWAITING_PAYMENT
        ClosureBlockerKindDTO.OrderInTransit -> ClosureBlockerKind.ORDER_IN_TRANSIT
    },
    reference = reference,
    // ⚠ Mobile routes on `target`, web on `href` — mobile has no URL router, which is why the closed
    // vocabulary exists. The backend sets both from one order id and a test pins that they agree.
    orderId = target.id,
    clearsAtIso = clearsAt,
    resolvableByShopper = resolvableByShopper,
)

private fun RetainedCategoryDTO.toDomain() = RetainedCategory(category = category, reason = reason)
