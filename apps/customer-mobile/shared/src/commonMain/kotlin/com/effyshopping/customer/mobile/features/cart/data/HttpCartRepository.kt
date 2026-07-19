package com.effyshopping.customer.mobile.features.cart.data

import com.effyshopping.customer.mobile.commerce.contract.Line
import com.effyshopping.customer.mobile.commerce.contract.MergeCartRequest
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * Server cart over the CORE api (019 US3 — the T041 carry-forward). This slice uses it for the
 * merge-on-sign-in step of checkout: the device-local guest cart is folded into the authoritative
 * server cart, which `checkout/intent` then reads. (Full server-cart read/write UI can follow.)
 */
class HttpCartRepository(private val core: HttpClient) {

    /** Merge the guest cart into the server cart (sums quantities per product). */
    suspend fun merge(lines: List<GuestCartLine>) {
        if (lines.isEmpty()) return
        request {
            core.post("v1/cart/merge") {
                setBody(MergeCartRequest(lines = lines.map { Line(productID = it.productId, quantity = it.quantity.toDouble()) }))
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
