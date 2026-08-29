package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.features.checkout.domain.ResendReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.ResendReceiptResult
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException

/**
 * Ask the platform to send a paid order's receipt again (052 US4, FR-027).
 *
 * ⚠ COLD PATH (`edge`), per the routing law: a low-frequency customer action whose entire job is to
 * enqueue an email. It is the same shape as 046's feedback submission.
 *
 * ⚠ IT SENDS NO BODY AND NO ADDRESS. The recipient is resolved server-side from the authenticated
 * subject; an address supplied by a client would make the endpoint an open relay for a document
 * carrying a person's name, delivery address and purchase history.
 */
class HttpReceiptResendRepository(private val edge: HttpClient) : ResendReceipt {

    override suspend fun invoke(orderId: String): ResendReceiptResult = try {
        val response = edge.post("customer/v1/orders/$orderId/receipt")
        when (response.status) {
            HttpStatusCode.Accepted, HttpStatusCode.OK -> ResendReceiptResult.Queued
            HttpStatusCode.TooManyRequests -> ResendReceiptResult.RateLimited
            // ⚠ 404 covers BOTH "not yours" and "no such order" — the server refuses them identically
            // so this client cannot tell them apart either (FR-029). Nothing here may try to.
            HttpStatusCode.NotFound, HttpStatusCode.Conflict -> ResendReceiptResult.Unavailable
            else -> ResendReceiptResult.Failed
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        ResendReceiptResult.Failed
    }
}
