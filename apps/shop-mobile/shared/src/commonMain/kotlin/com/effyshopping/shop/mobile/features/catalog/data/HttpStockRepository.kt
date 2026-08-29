package com.effyshopping.shop.mobile.features.catalog.data

import com.effyshopping.shop.mobile.contract.AdjustStockRequest
import com.effyshopping.shop.mobile.contract.LowStockRowDTO
import com.effyshopping.shop.mobile.contract.ProductStockDetailDTO
import com.effyshopping.shop.mobile.contract.SetStockRequest
import com.effyshopping.shop.mobile.contract.SetThresholdRequest
import com.effyshopping.shop.mobile.contract.SetTrackingRequest
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.core.http.ensureSuccess
import com.effyshopping.shop.mobile.features.catalog.domain.LowStockItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStockDetail
import com.effyshopping.shop.mobile.features.catalog.domain.StockReason
import com.effyshopping.shop.mobile.features.catalog.domain.StockRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The stock repository over `edge-api/inventory` (054 US1).
 *
 * ⚠ A DIFFERENT SERVICE, THE SAME CLIENT AND THE SAME POOL. [shopApi] is built for the gateway root,
 * so a path prefix is all that separates `shop/v1/...` from `inventory/v1/...`; the bearer, the
 * authorizer and the Cognito pool are identical, and cross-pool isolation (014 FR-029) is untouched.
 * The split exists because `edge-api/admin` had no CloudFormation resources left for the back-office
 * half of this feature, and one service for both audiences beats two copies of one stock service
 * (research R6).
 *
 * The backend scopes every call `WHERE shop_id = actorShopId` from the caller's own `shop_staff`
 * record — this client never supplies a shop id, and could not use one if it did.
 */
class HttpStockRepository(private val shopApi: HttpClient) : StockRepository {

    override suspend fun getStock(productId: String): ProductStockDetail = request {
        shopApi.get("inventory/v1/products/$productId/stock")
            .ensureSuccess().body<ProductStockDetailDTO>().toDomain()
    }

    override suspend fun setCount(
        productId: String,
        onHand: Int,
        reason: StockReason,
        note: String?,
    ): ProductStockDetail = request {
        shopApi.put("inventory/v1/products/$productId/stock") {
            setBody(SetStockRequest(onHand = onHand.toLong(), reason = reason.toRequestEnum(), note = note))
        }.ensureSuccess().body<ProductStockDetailDTO>().toDomain()
    }

    override suspend fun adjust(
        productId: String,
        delta: Int,
        reason: StockReason,
        note: String?,
    ): ProductStockDetail = request {
        shopApi.post("inventory/v1/products/$productId/stock/adjustments") {
            setBody(AdjustStockRequest(delta = delta.toLong(), reason = reason.toRequestEnum(), note = note))
        }.ensureSuccess().body<ProductStockDetailDTO>().toDomain()
    }

    override suspend fun setTracking(
        productId: String,
        tracked: Boolean,
        onHand: Int?,
    ): ProductStockDetail = request {
        shopApi.put("inventory/v1/products/$productId/stock/tracking") {
            setBody(SetTrackingRequest(tracked = tracked, onHand = onHand?.toLong()))
        }.ensureSuccess().body<ProductStockDetailDTO>().toDomain()
    }

    override suspend fun setThreshold(productId: String, threshold: Int?): ProductStockDetail = request {
        shopApi.put("inventory/v1/products/$productId/stock/threshold") {
            setBody(SetThresholdRequest(threshold = threshold?.toLong()))
        }.ensureSuccess().body<ProductStockDetailDTO>().toDomain()
    }

    override suspend fun lowStock(): List<LowStockItem> = request {
        shopApi.get("inventory/v1/low-stock")
            .ensureSuccess().body<List<LowStockRowDTO>>().map { it.toDomain() }
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
