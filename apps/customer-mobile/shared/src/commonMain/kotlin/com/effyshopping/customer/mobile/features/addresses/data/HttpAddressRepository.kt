package com.effyshopping.customer.mobile.features.addresses.data

import com.effyshopping.customer.mobile.commerce.contract.AddressDTO
import com.effyshopping.customer.mobile.commerce.contract.UpdateAddressRequest
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.AddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The address book over the COLD path (edge-api/customer, `/customer/v1/addresses`). Address
 * management is customer-profile capability, so it lives on the cold path per the routing law (011
 * FR-028) — 022 moved it there. [edge] carries the customer's session; every route is
 * customer-scoped server-side, so no identity is ever sent (FR-020). Transport failures become
 * AppError.Network (the 013 pattern).
 */
class HttpAddressRepository(private val edge: HttpClient) : AddressRepository {

    override suspend fun list(): List<SavedAddress> = request {
        edge.get("customer/v1/addresses").ensureSuccess().body<List<AddressDTO>>().map { it.toDomain() }
    }

    override suspend fun create(draft: AddressDraft): SavedAddress = request {
        edge.post("customer/v1/addresses") { setBody(draft.toCreateRequest()) }.ensureSuccess().body<AddressDTO>().toDomain()
    }

    override suspend fun update(id: String, draft: AddressDraft): SavedAddress = request {
        edge.patch("customer/v1/addresses/$id") { setBody(draft.toUpdateRequest()) }.ensureSuccess().body<AddressDTO>().toDomain()
    }

    override suspend fun setDefault(id: String): SavedAddress = request {
        edge.patch("customer/v1/addresses/$id") { setBody(UpdateAddressRequest(makeDefault = true)) }
            .ensureSuccess().body<AddressDTO>().toDomain()
    }

    override suspend fun delete(id: String) = request {
        val response = edge.delete("customer/v1/addresses/$id")
        when (response.status.value) {
            // 409 → deleting the default while others remain (FR-016a). Surface the reassign prompt,
            // distinct from the generic 409 mapping (which is a password-mode error).
            409 -> throw AppException(AppError.DefaultDeleteBlocked)
            // 404 → already gone (a racing device removed it). Benign: the row is absent either way.
            404 -> Unit
            else -> { response.ensureSuccess(); Unit }
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
