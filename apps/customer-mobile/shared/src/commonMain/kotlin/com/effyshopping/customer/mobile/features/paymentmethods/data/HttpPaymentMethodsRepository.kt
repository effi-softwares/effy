package com.effyshopping.customer.mobile.features.paymentmethods.data

import com.effyshopping.customer.mobile.commerce.contract.ListPaymentMethodsResponse
import com.effyshopping.customer.mobile.commerce.contract.PaymentMethodDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.paymentmethods.domain.KeptCard
import com.effyshopping.customer.mobile.features.paymentmethods.domain.PaymentMethodsRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.utils.io.errors.IOException
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException

/**
 * Payment methods over the HOT path (051 US6).
 *
 * ⚠ HOT PATH, unlike the address book beside it in the UI. 011's routing law puts *payment* on the hot
 * path, and the provider secret's custody boundary settles it: listing a card is a provider call, so a
 * cold-path route would need a second copy of that secret (research R9).
 *
 * ⚠ The ACCESS token is the bearer here — `core` is built with `BearerToken.Core`. Sending the id token
 * to the hot path 401s every request, which is the defect that silently broke every mobile cart write
 * from 019 until 027 (research R12a).
 */
class HttpPaymentMethodsRepository(private val core: HttpClient) : PaymentMethodsRepository {

    override suspend fun list(): List<KeptCard> = request {
        core.get("v1/payment-methods")
            .ensureSuccess()
            .body<ListPaymentMethodsResponse>()
            .paymentMethods
            .map { it.toDomain() }
    }

    override suspend fun remove(id: String) {
        request {
            // ⚠ Ownership is verified SERVER-SIDE before anything is detached; a client-supplied id is
            // never trusted (FR-026). A 404 means "not yours or not there" — deliberately the same
            // answer, so the route cannot be used as an oracle for which ids exist. It is also benign
            // from the shopper's point of view: the card is gone either way.
            val response = core.delete("v1/payment-methods/$id")
            when (response.status.value) {
                404 -> Unit
                else -> { response.ensureSuccess(); Unit }
            }
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

private fun PaymentMethodDTO.toDomain() = KeptCard(
    id = id,
    brand = brand,
    last4 = last4,
    expMonth = expMonth,
    expYear = expYear,
    isDefault = isDefault,
    usable = usable,
    unusableReason = unusableReason,
)
