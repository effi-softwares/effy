package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentResponse
import com.effyshopping.customer.mobile.commerce.contract.DeliveryChoiceRefusalDTO
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefused
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeChanged
import com.effyshopping.customer.mobile.features.checkout.domain.PointsRefusal
import com.effyshopping.customer.mobile.features.checkout.domain.PointsRefused
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderSummaryDTO
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutRepository
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
 * Checkout and orders over the commerce service (019 US3; moved from the retired Go backend by 070).
 * All are customer-authorized (the client's auth plugin adds the session). Transport failures become AppError.Network (the 013 pattern).
 */
class HttpCheckoutRepository(private val edge: HttpClient) : CheckoutRepository, OrdersRepository {

    override suspend fun createIntent(order: PlaceOrder): CheckoutIntent = request {
        val response = edge.post("commerce/v1/checkout/intent") { setBody(order.toRequest()) }
        // 069 — a 409 carrying one of the three delivery-choice codes is a NAMED refusal with the
        // options as they stand now. ⚠ Read BEFORE the generic mapping, which turns every 409 into an
        // unrelated account error; a 409 that is not one of ours still falls through to it.
        if (response.status == HttpStatusCode.Conflict || response.status == HttpStatusCode.UnprocessableEntity) {
            val body = response.bodyAsText()
            if (response.status == HttpStatusCode.Conflict) deliveryRefusalOrNull(body)?.let { throw it }
            // 077 — the delivery total is not the one shown; the body carries the fresh quote.
            if (response.status == HttpStatusCode.Conflict) feeChangedOrNull(body)?.let { throw it }
            // 074 — a points refusal, with the most the server would take when it said.
            pointsRefusalOrNull(body)?.let { throw it }
        }
        response.ensureSuccess().body<CreateCheckoutIntentResponse>().toDomain()
    }

    override suspend fun confirm(orderId: String): Boolean = request {
        edge.post("commerce/v1/checkout/confirm") {
            setBody(mapOf("orderId" to orderId))
        }.ensureSuccess().body<ConfirmResponse>().paid
    }

    override suspend fun quote(addressId: String): DeliveryQuote = request {
        edge.post("commerce/v1/checkout/quote") { setBody(mapOf("addressId" to addressId)) }
            .ensureSuccess().body<DeliveryQuoteDTO>().toDomain()
    }

    override suspend fun get(orderId: String): Receipt = request {
        edge.get("commerce/v1/orders/$orderId").ensureSuccess().body<OrderDTO>().toReceipt()
    }

    override suspend fun list(): List<OrderSummary> = request {
        edge.get("commerce/v1/orders").ensureSuccess().body<List<OrderSummaryDTO>>().map { it.toDomain() }
    }

    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            throw e
        } catch (e: DeliveryChoiceRefused) {
            throw e // a refusal the shopper can act on — never flattened into "unexpected"
        } catch (e: PointsRefused) {
            throw e
        } catch (e: DeliveryFeeChanged) {
            throw e
        } catch (e: IOException) {
            throw AppException(AppError.Network)
        } catch (e: UnresolvedAddressException) {
            throw AppException(AppError.Network)
        } catch (e: Throwable) {
            throw AppException(AppError.Unexpected)
        }
}

/**
 * Decode a delivery-choice refusal, or null when the body is some other conflict.
 *
 * ⚠ Lenient on purpose: the body is an RFC 9457 problem with `code` and `quote` beside the standard
 * members, and an unknown `code` (a refusal a newer server adds) must fall through to the generic
 * mapping rather than crash the checkout.
 */
internal fun deliveryRefusalOrNull(body: String): DeliveryChoiceRefused? =
    runCatching { refusalJson.decodeFromString(DeliveryChoiceRefusalDTO.serializer(), body).toDomain() }.getOrNull()

private val refusalJson = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; explicitNulls = false }

/** 074 — decode a points refusal, or null when the body is some other refusal. */
internal fun pointsRefusalOrNull(body: String): PointsRefused? = runCatching {
    val dto = refusalJson.decodeFromString(PointsRefusalBody.serializer(), body)
    val reason = when (dto.code) {
        "points_balance_changed" -> PointsRefusal.BalanceChanged
        "points_exceed_total" -> PointsRefusal.ExceedTotal
        "points_card_remainder_too_small" -> PointsRefusal.CardRemainderTooSmall
        "payment_in_progress" -> PointsRefusal.PaymentInProgress
        else -> return@runCatching null
    }
    PointsRefused(reason, dto.maxPoints)
}.getOrNull()

/** 077 — decode a "delivery fee changed" refusal, or null when the body is some other conflict. */
internal fun feeChangedOrNull(body: String): DeliveryFeeChanged? = runCatching {
    val dto = refusalJson.decodeFromString(FeeChangedBody.serializer(), body)
    if (dto.code != "delivery_fee_changed") return@runCatching null
    DeliveryFeeChanged(dto.quote?.toDomain())
}.getOrNull()

@kotlinx.serialization.Serializable
private data class FeeChangedBody(val code: String? = null, val quote: DeliveryQuoteDTO? = null)

@kotlinx.serialization.Serializable
private data class PointsRefusalBody(val code: String? = null, val maxPoints: Long? = null)

@kotlinx.serialization.Serializable
private data class ConfirmResponse(val orderId: String = "", val paid: Boolean = false)
