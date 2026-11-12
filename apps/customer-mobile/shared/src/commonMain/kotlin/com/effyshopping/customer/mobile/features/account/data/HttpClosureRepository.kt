package com.effyshopping.customer.mobile.features.account.data

import com.effyshopping.customer.mobile.contract.ClosureBlockerDTO
import com.effyshopping.customer.mobile.contract.ClosureBlockerKind as ClosureBlockerKindDTO
import com.effyshopping.customer.mobile.contract.ClosureChallengeResultDTO
import com.effyshopping.customer.mobile.contract.ClosurePreviewDTO
import com.effyshopping.customer.mobile.contract.ClosureRequestDTO
import com.effyshopping.customer.mobile.contract.ClosureResultDTO
import com.effyshopping.customer.mobile.contract.ProblemJSON
import com.effyshopping.customer.mobile.contract.RetainedCategoryDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.effyJson
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.account.domain.ClosureRefusalWords
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
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
 * Account closure over the edge API.
 *
 * The DTO never escapes this layer (Principle VI) - the domain gets [ClosurePreview], which
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
        }.refusing("payment-in-progress", "orderNumber", ClosureRefusalWords::paymentInProgress)
            .ensureSuccess().body<ClosureResultDTO>().eraseAfter
    }

    override suspend fun restore(): Unit = request {
        edge.post("customer/v1/closure/restore")
            .refusing("closure-final", "eraseAfter") { iso -> ClosureRefusalWords.closureFinal(iso.take(10)) }
            .ensureSuccess()
    }

    /**
     * 113: a 409 of this problem type becomes a [AppError.Validation] carrying the refusal's own words, so the screen
     * says exactly what happened (the generic 409 mapping means something else).
     */
    private suspend fun HttpResponse.refusing(slug: String, field: String, words: (String) -> String): HttpResponse {
        if (status.value != 409) return this
        val problem = runCatching { effyJson.decodeFromString(ProblemJSON.serializer(), bodyAsText()) }.getOrNull()
        if (problem?.type?.endsWith("/$slug") != true) return this
        val value = problem.errors?.firstOrNull { it.field == field }?.message.orEmpty()
        throw AppException(AppError.Validation(words(value)))
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
    pointsHeld = pointsHeld?.takeIf { it > 0 },
    pointsValueAmount = pointsValueAmount,
)

private fun ClosureBlockerDTO.toDomain() = ClosureBlocker(
    kind = when (kind) {
        ClosureBlockerKindDTO.OrderInTransit -> ClosureBlockerKind.ORDER_IN_TRANSIT
    },
    reference = reference,
    // Mobile routes on `target`, web on `href` - mobile has no URL router, which is why the closed
    // vocabulary exists. The backend sets both from one order id and a test pins that they agree.
    orderId = target.id,
    clearsAtIso = clearsAt,
)

private fun RetainedCategoryDTO.toDomain() = RetainedCategory(category = category, reason = reason)
