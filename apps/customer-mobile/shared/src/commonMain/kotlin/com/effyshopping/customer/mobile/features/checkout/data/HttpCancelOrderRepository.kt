package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.features.checkout.domain.CancelOrder
import com.effyshopping.customer.mobile.features.checkout.domain.CancelOrderResult
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Cancel an order: a full refund, on the commerce service. It sends no body: the order is in the path, the
 * caller comes from the token and the amount is the platform's arithmetic, so no field can redirect money.
 */
class HttpCancelOrderRepository(private val edge: HttpClient) : CancelOrder {

    @Serializable
    private data class Response(@SerialName("amount") val amount: String = "")

    override suspend fun invoke(orderId: String): CancelOrderResult = try {
        val response = edge.post("commerce/v1/orders/$orderId/cancel")
        when (response.status) {
            HttpStatusCode.OK, HttpStatusCode.Accepted ->
                CancelOrderResult.Cancelled(response.body<Response>().amount)
            // The server refuses a not-cancellable order with 422 and says why in prose this client
            // deliberately does not read — the sentence is the screen's to write, in the app's voice.
            HttpStatusCode.UnprocessableEntity, HttpStatusCode.Conflict ->
                CancelOrderResult.AlreadyBeingPrepared
            // Covers both "not yours" and "no such order" — the server refuses them identically
            // so this client cannot tell them apart either. Nothing here may try to.
            HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden, HttpStatusCode.NotFound ->
                CancelOrderResult.NotAllowed
            else -> CancelOrderResult.Failed
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        CancelOrderResult.Failed
    }
}
