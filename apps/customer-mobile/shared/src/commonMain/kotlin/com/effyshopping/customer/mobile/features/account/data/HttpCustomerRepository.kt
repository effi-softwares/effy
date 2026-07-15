package com.effyshopping.customer.mobile.features.account.data

import com.effyshopping.customer.mobile.contract.PasswordChallengeResultDTO
import com.effyshopping.customer.mobile.contract.PasswordWriteDTO
import com.effyshopping.customer.mobile.contract.PasswordWriteDTOMode
import com.effyshopping.customer.mobile.contract.PasswordWriteResultDTO
import com.effyshopping.customer.mobile.contract.CustomerDTO
import com.effyshopping.customer.mobile.contract.ResetConfirmDTO
import com.effyshopping.customer.mobile.contract.UpdateCustomerDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * The account repository over the edge API (013 US4/US5). [edge] is the client built for
 * `EDGE_API_BASE_URL`, carrying the two-token protocol. Every call funnels through [request] so a
 * transport failure becomes `AppError.Network` rather than an opaque exception, and a mapped HTTP
 * error ([ensureSuccess]) propagates as an `AppException`.
 */
class HttpCustomerRepository(private val edge: HttpClient) : CustomerRepository {

    override suspend fun me(seedPassword: Boolean): Customer = request {
        edge.get("customer/v1/me") {
            if (seedPassword) parameter("route", "password")
        }.ensureSuccess().body<CustomerDTO>().toDomain()
    }

    override suspend fun updateName(given: String?, family: String?): Customer = request {
        edge.patch("customer/v1/me") {
            setBody(UpdateCustomerDTO(familyName = family, givenName = given))
        }.ensureSuccess().body<CustomerDTO>().toDomain()
    }

    override suspend fun requestPasswordChallenge(): String = request {
        edge.post("customer/v1/password/challenge") {
            setBody(emptyMap<String, String>())
        }.ensureSuccess().body<PasswordChallengeResultDTO>().maskedDestination
    }

    override suspend fun setPassword(code: String, newPassword: String): Customer = request {
        edge.put("customer/v1/password") {
            setBody(PasswordWriteDTO(mode = PasswordWriteDTOMode.Set, code = code, newPassword = newPassword))
        }.ensureSuccess().body<PasswordWriteResultDTO>().customer.toDomain()
    }

    override suspend fun changePassword(current: String, newPassword: String): Customer = request {
        edge.put("customer/v1/password") {
            setBody(PasswordWriteDTO(mode = PasswordWriteDTOMode.Change, currentPassword = current, newPassword = newPassword))
        }.ensureSuccess().body<PasswordWriteResultDTO>().customer.toDomain()
    }

    override suspend fun signOutEverywhere() {
        request { edge.delete("customer/v1/sessions").ensureSuccess() }
    }

    override suspend fun confirmPasswordReset(email: String, code: String, newPassword: String) {
        request {
            edge.post("customer/v1/password/reset-confirm") {
                setBody(ResetConfirmDTO(code = code, email = email, newPassword = newPassword))
            }.ensureSuccess()
        }
    }

    /** Run [block]; turn a transport failure into AppError.Network, and re-raise a mapped AppException. */
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
