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
 * Cancel an order (055 US2).
 *
 * ⚠ HOT PATH (`core`), unlike the receipt resend beside it. Cancelling MOVES MONEY, and the payment
 * secret lives in `core-api` and nowhere else (019 SC-012). The cold path could only do this by
 * holding the secret too, or by forwarding this customer's token to another service — the
 * auth-brokering Principle IV forbids by name (research R1).
 *
 * ⚠ IT SENDS NO BODY. Which order is in the path, who the caller is comes from the token, and the
 * amount is the platform's arithmetic. A field here would be a field somebody could use to redirect
 * somebody else's money.
 */
class HttpCancelOrderRepository(private val core: HttpClient) : CancelOrder {

    @Serializable
    private data class Response(@SerialName("amount") val amount: String = "")

    override suspend fun invoke(orderId: String): CancelOrderResult = try {
        val response = core.post("v1/orders/$orderId/cancel")
        when (response.status) {
            HttpStatusCode.OK, HttpStatusCode.Accepted ->
                CancelOrderResult.Cancelled(response.body<Response>().amount)
            // ⚠ The server refuses a not-cancellable order with 422 and says why in prose this client
            // deliberately does not read — the sentence is the screen's to write, in the app's voice.
            HttpStatusCode.UnprocessableEntity, HttpStatusCode.Conflict ->
                CancelOrderResult.AlreadyBeingPrepared
            // ⚠ 404 covers BOTH "not yours" and "no such order" — the server refuses them identically
            // so this client cannot tell them apart either (FR-016). Nothing here may try to.
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
