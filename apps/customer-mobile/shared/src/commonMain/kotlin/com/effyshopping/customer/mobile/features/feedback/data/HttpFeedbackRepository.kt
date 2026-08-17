package com.effyshopping.customer.mobile.features.feedback.data

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.core.platform.platformTag
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackDraft
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackRepository
import com.effyshopping.customer.mobile.features.feedback.domain.SubmitFeedbackResult
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Feedback over the EDGE api (cold path — the routing law: feedback is low-frequency, async-email work,
 * not commerce). Maps the wire DTO to the domain explicitly (Principle VI).
 *
 * ⚠ Two routes, one method. A signed-in shopper posts to `customer/v1/feedback` (the edge client
 * attaches the token); a guest posts to `customer/v1/feedback/public` with an unverified email.
 */
class HttpFeedbackRepository(private val edge: HttpClient) : FeedbackRepository {

    override suspend fun submit(draft: FeedbackDraft, authenticated: Boolean): SubmitFeedbackResult {
        val path = if (authenticated) "customer/v1/feedback" else "customer/v1/feedback/public"
        return try {
            val dto = edge.post(path) {
                contentType(ContentType.Application.Json)
                setBody(
                    SubmitBody(
                        category = draft.category.wire,
                        message = draft.message,
                        rating = draft.rating,
                        source = draft.source.wire,
                        platform = platformTag(),
                        // ⚠ Sent only on the guest path — the authed route ignores a body email and uses
                        // the verified profile one. Null on the authed path keeps the payload honest.
                        email = if (authenticated) null else draft.email?.takeIf { it.isNotBlank() },
                        name = draft.name?.takeIf { it.isNotBlank() },
                    ),
                )
            }.ensureSuccess().body<SubmitResultDTO>()

            SubmitFeedbackResult.Ok(dto.referenceCode)
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            // ensureSuccess mapped the status: 400 → Validation, 429 → RateLimited, else Error.
            when (e.error) {
                is AppError.Validation -> SubmitFeedbackResult.Invalid()
                is AppError.RateLimited -> SubmitFeedbackResult.RateLimited
                else -> SubmitFeedbackResult.Error
            }
        } catch (e: IOException) {
            SubmitFeedbackResult.Error
        } catch (e: UnresolvedAddressException) {
            SubmitFeedbackResult.Error
        } catch (e: Throwable) {
            SubmitFeedbackResult.Error
        }
    }
}

@Serializable
private data class SubmitBody(
    val category: String,
    val message: String,
    val rating: Int?,
    val source: String,
    val platform: String,
    val email: String?,
    val name: String?,
)

@Serializable
private data class SubmitResultDTO(
    val status: String,
    @SerialName("referenceCode") val referenceCode: String,
)
