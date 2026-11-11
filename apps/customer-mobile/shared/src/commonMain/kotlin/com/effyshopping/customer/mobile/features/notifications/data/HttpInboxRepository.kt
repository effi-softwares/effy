package com.effyshopping.customer.mobile.features.notifications.data

import com.effyshopping.customer.mobile.contract.Importance
import com.effyshopping.customer.mobile.contract.InboxCountDTO
import com.effyshopping.customer.mobile.contract.InboxItemDTO
import com.effyshopping.customer.mobile.contract.InboxPageDTO
import com.effyshopping.customer.mobile.contract.InboxReadAllDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.core.push.parseCustomerDestination
import com.effyshopping.customer.mobile.features.notifications.domain.InboxFilter
import com.effyshopping.customer.mobile.features.notifications.domain.InboxItem
import com.effyshopping.customer.mobile.features.notifications.domain.InboxPage
import com.effyshopping.customer.mobile.features.notifications.domain.InboxRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ResponseException
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The inbox over the customer service (110, contracts/inbox-api.md). The DTOs never leave this file. */
class HttpInboxRepository(private val edge: HttpClient) : InboxRepository {

    override suspend fun page(filter: InboxFilter, category: String?, cursor: String?): InboxPage = request {
        edge.get("customer/v1/notifications") {
            if (filter != InboxFilter.ALL) parameter("filter", filter.wire)
            if (category != null) parameter("category", category)
            if (cursor != null) parameter("cursor", cursor)
        }.ensureSuccess().body<InboxPageDTO>().let { dto ->
            InboxPage(
                pinned = dto.pinned.map(::toItem),
                items = dto.items.map(::toItem),
                nextCursor = dto.nextCursor,
                categories = dto.categories,
                unseenCount = dto.unseenCount.toInt(),
            )
        }
    }

    override suspend fun unseenCount(): Int = request {
        edge.get("customer/v1/notifications/unseen-count").ensureSuccess().body<InboxCountDTO>().unseenCount.toInt()
    }

    override suspend fun markSeen(before: String): Int = request {
        edge.post("customer/v1/notifications/seen") { json(cutoff(before)) }.ensureSuccess().body<InboxCountDTO>().unseenCount.toInt()
    }

    override suspend fun readAll(before: String): Int = request {
        edge.post("customer/v1/notifications/read-all") { json(cutoff(before)) }.ensureSuccess().body<InboxReadAllDTO>().unseenCount.toInt()
    }

    override suspend fun setArchived(id: String, archived: Boolean) {
        try {
            request {
                edge.patch("customer/v1/notifications/${id.encodeURLPathPart()}") {
                    json(Json.encodeToString(buildJsonObject { put("archived", archived) }))
                }.ensureSuccess()
            }
        } catch (e: ResponseException) {
            // Already gone (archived elsewhere, or removed by retention): nothing left to do.
            if (e.response.status.value != 404) throw AppException(AppError.Unexpected)
        } catch (e: AppException) {
            if (e.error !is AppError.NotFound) throw e
        }
    }

    override suspend fun markRead(id: String) {
        try {
            edge.post("customer/v1/notifications/${id.encodeURLPathPart()}/read")
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            // The screen opens either way; the dot clears on the next read.
        }
    }

    private fun cutoff(before: String) = Json.encodeToString(buildJsonObject { put("before", before) })

    private fun io.ktor.client.request.HttpRequestBuilder.json(body: String) {
        contentType(ContentType.Application.Json)
        setBody(body)
    }

    private fun toItem(dto: InboxItemDTO) = InboxItem(
        id = dto.id,
        type = dto.type,
        category = dto.category,
        important = dto.importance == Importance.Important,
        title = dto.title,
        body = dto.body,
        destination = parseCustomerDestination(dto.destination),
        createdAt = dto.createdAt,
        read = dto.readAt != null,
        endsLabel = dto.endsLabel,
        imageUrl = dto.imageURL,
    )

    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            throw e
        } catch (e: ResponseException) {
            throw e
        } catch (e: IOException) {
            throw AppException(AppError.Network)
        } catch (e: UnresolvedAddressException) {
            throw AppException(AppError.Network)
        } catch (e: Throwable) {
            throw AppException(AppError.Unexpected)
        }
}
