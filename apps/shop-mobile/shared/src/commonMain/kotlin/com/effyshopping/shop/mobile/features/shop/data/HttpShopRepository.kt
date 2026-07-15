package com.effyshopping.shop.mobile.features.shop.data

import com.effyshopping.shop.mobile.contract.ShopStaffRecordDTO
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.core.http.ensureSuccess
import com.effyshopping.shop.mobile.features.shop.domain.ManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.Operator
import com.effyshopping.shop.mobile.features.shop.domain.ShopRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.statement.HttpResponse
import io.ktor.http.isSuccess
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The shop repository over `edge-api/shop` (014). [shopApi] is the client built for `SHOP_API_BASE_URL`,
 * carrying the single access-token bearer (D2s). A transport failure becomes `AppError.Network`.
 */
class HttpShopRepository(private val shopApi: HttpClient) : ShopRepository {

    override suspend fun me(): Operator = request {
        shopApi.get("shop/v1/me").ensureSuccess().body<ShopStaffRecordDTO>().toDomain()
    }

    /**
     * The manager gate (FR-023–FR-026). 200 → GRANTED; **403 → DENIED** (uniform); **any error →
     * DENIED (fail-closed)** — never a grant. The 403 body is never inspected for *which* term failed.
     */
    override suspend fun managerAccess(): ManagerAccess =
        try {
            val resp: HttpResponse = shopApi.get("shop/v1/manager-ping")
            if (resp.status.isSuccess()) ManagerAccess.GRANTED else ManagerAccess.DENIED
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            ManagerAccess.DENIED // fail closed
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
