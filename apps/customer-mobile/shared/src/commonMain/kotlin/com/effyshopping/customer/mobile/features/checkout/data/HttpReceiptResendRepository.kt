package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.features.checkout.domain.ResendReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.ResendReceiptResult
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException

/**
 * Ask the platform to send a paid order's receipt again. No body and no address: the recipient is resolved
 * from the authenticated subject, so the endpoint cannot relay someone's receipt elsewhere.
 */
class HttpReceiptResendRepository(private val edge: HttpClient) : ResendReceipt {

    override suspend fun invoke(orderId: String): ResendReceiptResult = try {
        val response = edge.post("customer/v1/orders/$orderId/receipt")
        when (response.status) {
            HttpStatusCode.Accepted, HttpStatusCode.OK -> ResendReceiptResult.Queued
            HttpStatusCode.TooManyRequests -> ResendReceiptResult.RateLimited
            // Covers both "not yours" and "no such order" - the server refuses them identically
            // so this client cannot tell them apart either. Nothing here may try to.
            HttpStatusCode.NotFound, HttpStatusCode.Conflict -> ResendReceiptResult.Unavailable
            else -> ResendReceiptResult.Failed
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        ResendReceiptResult.Failed
    }
}
