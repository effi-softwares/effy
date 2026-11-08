package com.effyshopping.driver.mobile.features.inbox.data

import com.effyshopping.driver.mobile.contract.Importance
import com.effyshopping.driver.mobile.contract.InboxCountDTO
import com.effyshopping.driver.mobile.contract.InboxItemDTO
import com.effyshopping.driver.mobile.contract.InboxPageDTO
import com.effyshopping.driver.mobile.contract.InboxReadAllDTO
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.core.push.parseDriverDestination
import com.effyshopping.driver.mobile.features.inbox.domain.InboxItem
import com.effyshopping.driver.mobile.features.inbox.domain.InboxPage
import com.effyshopping.driver.mobile.features.inbox.domain.InboxRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ResponseException
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The inbox over the driver service (110, contracts/inbox-api.md). The DTOs never leave this file. */
class HttpInboxRepository(private val edge: HttpClient) : InboxRepository {

    override suspend fun page(unreadOnly: Boolean, cursor: String?): InboxPage = request {
        edge.get("driver/v1/notifications") {
            if (unreadOnly) parameter("filter", "unread")
            if (cursor != null) parameter("cursor", cursor)
        }.ensureSuccess().body<InboxPageDTO>().let { dto ->
            InboxPage(dto.pinned.map(::toItem), dto.items.map(::toItem), dto.nextCursor, dto.unseenCount.toInt())
        }
    }

    override suspend fun unseenCount(): Int = request {
        edge.get("driver/v1/notifications/unseen-count").ensureSuccess().body<InboxCountDTO>().unseenCount.toInt()
    }

    override suspend fun markSeen(before: String): Int = request {
        edge.post("driver/v1/notifications/seen") { json(cutoff(before)) }.ensureSuccess().body<InboxCountDTO>().unseenCount.toInt()
    }

    override suspend fun readAll(before: String): Int = request {
        edge.post("driver/v1/notifications/read-all") { json(cutoff(before)) }.ensureSuccess().body<InboxReadAllDTO>().unseenCount.toInt()
    }

    override suspend fun setArchived(id: String, archived: Boolean) {
        try {
            request {
                edge.patch("driver/v1/notifications/${id.encodeURLPathPart()}") {
                    json(Json.encodeToString(buildJsonObject { put("archived", archived) }))
                }.ensureSuccess()
            }
        } catch (e: AppException) {
            if (e.error !is AppError.NotFound) throw e
        }
    }

    override suspend fun markRead(id: String) {
        try {
            edge.post("driver/v1/notifications/${id.encodeURLPathPart()}/read")
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
        }
    }

    private fun cutoff(before: String) = Json.encodeToString(buildJsonObject { put("before", before) })

    private fun HttpRequestBuilder.json(body: String) {
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
        destination = parseDriverDestination(dto.destination),
        createdAt = dto.createdAt,
        read = dto.readAt != null,
    )

    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            throw e
        } catch (e: ResponseException) {
            throw AppException(if (e.response.status.value == 404) AppError.NotFound else AppError.Unexpected)
        } catch (e: Throwable) {
            throw AppException(AppError.Network)
        }
}
