package com.effyshopping.mobile.kit.live

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json

private val descriptorJson = Json { ignoreUnknownKeys = true }

/**
 * Asks this audience's service which channel is this person's (`GET {path}`, e.g. `driver/v1/live`).
 * 204, 401, 403 and 404 mean "no channel" and return `null` (live updates off); only a failure to find
 * out (no network, a 5xx) throws, and is retried.
 */
suspend fun fetchLiveDescriptor(api: HttpClient, path: String): LiveDescriptor? {
    val response = api.get(path)
    return when (response.status.value) {
        200 -> descriptorJson.decodeFromString<LiveDescriptor>(response.bodyAsText())
        204, 401, 403, 404 -> null
        else -> error("live: the channel could not be looked up (${response.status.value})")
    }
}
