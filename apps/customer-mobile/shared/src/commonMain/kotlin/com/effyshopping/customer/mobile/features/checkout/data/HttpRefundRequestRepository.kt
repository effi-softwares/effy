package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.features.checkout.domain.RefundRequestInput
import com.effyshopping.customer.mobile.features.checkout.domain.RefundRequestResult
import com.effyshopping.customer.mobile.features.checkout.domain.RequestRefund
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.ContentType
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable

/** Raise a refund request (commerce service). It moves no money: the 201 means the ask was recorded. */
class HttpRefundRequestRepository(private val edge: HttpClient) : RequestRefund {

    @Serializable
    private data class Item(val orderItemId: String, val quantity: Int)

    @Serializable
    private data class Body(val message: String, val items: List<Item>)

    override suspend fun invoke(orderId: String, input: RefundRequestInput): RefundRequestResult = try {
        val response = edge.post("commerce/v1/orders/$orderId/refund-requests") {
            contentType(ContentType.Application.Json)
            setBody(Body(input.message, input.items.map { Item(it.orderItemId, it.quantity) }))
        }
        when (response.status) {
            HttpStatusCode.Created, HttpStatusCode.OK -> RefundRequestResult.Received
            // Is not a failure - their ask is already with us, and saying so is the one thing
            // that stops them raising it again through the generic inbox.
            HttpStatusCode.Conflict -> RefundRequestResult.AlreadyOpen
            // Covers both "not yours" and "no such order" - the server refuses them identically
            // so this client cannot tell them apart either.
            HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden, HttpStatusCode.NotFound ->
                RefundRequestResult.NotAllowed
            else -> RefundRequestResult.Failed
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        RefundRequestResult.Failed
    }
}
