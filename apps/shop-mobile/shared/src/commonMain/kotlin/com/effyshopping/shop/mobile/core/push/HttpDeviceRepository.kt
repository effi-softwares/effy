package com.effyshopping.shop.mobile.core.push

import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart
import kotlinx.serialization.Serializable

/**
 * The device-token repository over the edge API (050). [edge] is the client built for
 * `EDGE_API_BASE_URL`, carrying the two-token protocol — the gateway's customer authorizer derives the
 * owning subject, so the body never carries it (FR-012).
 *
 * Best-effort by design: registration failures must never block a user flow (FR-024/FR-027), so the
 * caller wraps these in `runCatching`.
 */
class HttpDeviceRepository(private val edge: HttpClient) : DeviceRepository {

    @Serializable
    private data class RegisterBody(val fcmToken: String, val platform: String)

    override suspend fun register(fcmToken: String, platform: String) {
        edge.post("shop/v1/devices") {
            contentType(ContentType.Application.Json)
            setBody(RegisterBody(fcmToken, platform))
        }
    }

    override suspend fun unregister(fcmToken: String) {
        edge.delete("shop/v1/devices/${fcmToken.encodeURLPathPart()}")
    }
}
