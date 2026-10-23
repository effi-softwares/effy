package com.effyshopping.customer.mobile.features.addresses.data

import com.effyshopping.customer.mobile.commerce.contract.AddressDTO
import com.effyshopping.customer.mobile.commerce.contract.UpdateAddressRequest
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft
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
 * The address book over `/customer/v1/addresses`. [edge] carries the session; every route is
 * customer-scoped server-side, so no identity is sent. Transport failures become AppError.Network.
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

    override suspend fun saveInstructions(id: String, instructions: InstructionsDraft): SavedAddress = request {
        // Only this field: every other one is null, which this app's JSON omits and the server leaves alone.
        edge.patch("customer/v1/addresses/$id") {
            setBody(UpdateAddressRequest(defaultDeliveryInstructions = instructions.toWireDefault()))
        }.ensureSuccess().body<AddressDTO>().toDomain()
    }

    override suspend fun delete(id: String) = request {
        val response = edge.delete("customer/v1/addresses/$id")
        when (response.status.value) {
            // 409 → deleting the default while others remain. Surface the reassign prompt,
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
