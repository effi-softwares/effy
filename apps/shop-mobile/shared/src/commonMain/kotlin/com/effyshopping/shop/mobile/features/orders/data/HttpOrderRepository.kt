package com.effyshopping.shop.mobile.features.orders.data

import com.effyshopping.shop.mobile.contract.FulfillmentDetailDTO
import com.effyshopping.shop.mobile.contract.FulfillmentQueueDTO
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.core.http.ensureSuccess
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentDetail
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentSummary
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentTransition
import com.effyshopping.shop.mobile.features.orders.domain.ItemProgress
import com.effyshopping.shop.mobile.features.orders.domain.OrderRepository
import com.effyshopping.shop.mobile.features.orders.domain.QueueState
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The fulfillment repository over `edge-api/shop` (020). [shopApi] is the container's shop client — the SAME
 * single-bearer client the operator record and the catalog use (cross-pool isolation, FR-029) — so every call
 * here is automatically authorized and scoped by the backend to the operator's own shop. Paths are RELATIVE
 * to the client's base url (`shop/v1/...`).
 *
 * Note what is NOT in any request below: **no shop identifier**, in path, query or body (FR-019, SC-007).
 * Non-2xx → the mapped `AppException` via [ensureSuccess] (403 covers both "not yours" and "no such portion",
 * uniformly and deliberately); transport failures → `AppError.Network`; anything unforeseen →
 * `AppError.Unexpected`, so no SDK or HTTP text ever reaches a shop floor tablet.
 */
class HttpOrderRepository(private val shopApi: HttpClient) : OrderRepository {

    override suspend fun listFulfillments(state: QueueState): List<FulfillmentSummary> = request {
        shopApi.get("shop/v1/fulfillments") {
            parameter("state", state.toDto().value)
        }.ensureSuccess().body<FulfillmentQueueDTO>().toDomain()
    }

    override suspend fun getFulfillment(id: String): FulfillmentDetail = request {
        // Side effect by contract: a `pending` portion becomes `received` — opening it IS the
        // acknowledgement (FR-011a). Guarded server-side, so concurrent opens produce one transition.
        shopApi.get("shop/v1/fulfillments/$id").ensureSuccess().body<FulfillmentDetailDTO>().toDomain()
    }

    override suspend fun transition(id: String, to: FulfillmentTransition): FulfillmentDetail = request {
        // 409 → AppError.Conflict: the portion is not in a state this transition is legal from — someone
        // else moved it. The caller surfaces that and re-reads; it never retries (FR-014).
        shopApi.post("shop/v1/fulfillments/$id/status") { setBody(to.toRequest()) }
            .ensureSuccess().body<FulfillmentDetailDTO>().toDomain()
    }

    override suspend fun recordItemProgress(
        id: String,
        orderItemId: String,
        progress: ItemProgress,
    ): FulfillmentDetail = request {
        shopApi.patch("shop/v1/fulfillments/$id/items/$orderItemId") { setBody(progress.toRequest()) }
            .ensureSuccess().body<FulfillmentDetailDTO>().toDomain()
    }

    /** Uniform failure mapping (mirrors `HttpCatalogRepository`): AppException passes through; IO → Network. */
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
