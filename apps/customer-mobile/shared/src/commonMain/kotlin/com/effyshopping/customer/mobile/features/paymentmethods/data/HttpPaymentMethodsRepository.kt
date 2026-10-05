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
 * Payment methods over the commerce service (051 US6; moved from the retired Go backend by 070).
 *
 * ⚠ They live with checkout, not with the address book beside them in the UI: listing a card is a
 * call to the payment provider, and the provider secret has one custodian.
 */
class HttpPaymentMethodsRepository(private val edge: HttpClient) : PaymentMethodsRepository {

    override suspend fun list(): List<KeptCard> = request {
        edge.get("commerce/v1/payment-methods")
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
            val response = edge.delete("commerce/v1/payment-methods/$id")
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
