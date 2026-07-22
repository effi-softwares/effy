package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentResponse
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteRequest
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteResponse
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderSummaryDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutRepository
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.OrderSummary
import com.effyshopping.customer.mobile.features.checkout.domain.OrdersRepository
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * Checkout / orders / addresses over the CORE api (019 US3). All are customer-authorized (the two-token
 * plugin adds the session). Transport failures become AppError.Network (the 013 pattern).
 */
class HttpCheckoutRepository(private val core: HttpClient) : CheckoutRepository, OrdersRepository {

    override suspend fun quote(addressId: String): DeliveryQuote = request {
        core.post("v1/checkout/quote") {
            setBody(DeliveryQuoteRequest(addressID = addressId))
        }.ensureSuccess().body<DeliveryQuoteResponse>().toDomain()
    }

    override suspend fun createIntent(order: PlaceOrder): CheckoutIntent = request {
        val response = core.post("v1/checkout/intent") { setBody(order.toRequest()) }
        // 409 means the captured quote is stale (FR-011a) — re-quote before charging, distinct from the
        // generic 409 mapping. Every other non-2xx flows through ensureSuccess's normal AppError mapping.
        if (response.status.value == 409) throw AppException(AppError.RequoteRequired)
        response.ensureSuccess().body<CreateCheckoutIntentResponse>().toDomain()
    }

    override suspend fun confirm(orderId: String): Boolean = request {
        core.post("v1/checkout/confirm") {
            setBody(mapOf("orderId" to orderId))
        }.ensureSuccess().body<ConfirmResponse>().paid
    }

    override suspend fun get(orderId: String): Receipt = request {
        core.get("v1/orders/$orderId").ensureSuccess().body<OrderDTO>().toReceipt()
    }

    override suspend fun list(): List<OrderSummary> = request {
        core.get("v1/orders").ensureSuccess().body<List<OrderSummaryDTO>>().map { it.toDomain() }
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
private data class ConfirmResponse(val orderId: String = "", val paid: Boolean = false)
