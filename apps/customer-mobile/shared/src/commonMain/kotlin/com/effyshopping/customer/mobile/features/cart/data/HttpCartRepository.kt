package com.effyshopping.customer.mobile.features.cart.data

import com.effyshopping.customer.mobile.commerce.contract.Line
import com.effyshopping.customer.mobile.commerce.contract.ReplaceCartRequest
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.cart.domain.CartRepository
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import io.ktor.client.HttpClient
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * Server cart over the CORE api (019 US3). Checkout snapshots the device-local guest cart to the server
 * cart via an idempotent REPLACE (PUT /v1/cart, R8 amended → Option B); `checkout/quote` + `checkout/intent`
 * then read that server cart. The local cart stays the source of truth.
 */
class HttpCartRepository(private val core: HttpClient) : CartRepository {

    /** Replace the server cart with EXACTLY these lines (idempotent; empty is skipped, not a wipe here). */
    override suspend fun replace(lines: List<GuestCartLine>) {
        if (lines.isEmpty()) return
        request {
            core.put("v1/cart") {
                setBody(ReplaceCartRequest(lines = lines.map { Line(productID = it.productId, quantity = it.quantity.toDouble()) }))
            }.ensureSuccess()
            Unit
        }
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
