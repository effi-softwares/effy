package com.effyshopping.mobile.kit.live

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json

private val descriptorJson = Json { ignoreUnknownKeys = true }

/**
 * Ask this audience's service which channel is this person's (071): `GET {path}` on the app's own
 * authenticated client, e.g. `shop/v1/live`.
 *
 * ⚠ "NO CHANNEL FOR YOU" IS AN ANSWER, NOT A FAILURE. 204 (none in this environment), 401/403 (no
 * session, or no active record) and 404 (a backend that predates the route) all return `null`: the
 * app then shows that live updates are off and reads on open, on return and on request. Only a
 * failure to FIND OUT — no network, a 5xx — throws, and that is what the client retries.
 */
suspend fun fetchLiveDescriptor(api: HttpClient, path: String): LiveDescriptor? {
    val response = api.get(path)
    return when (response.status.value) {
        200 -> descriptorJson.decodeFromString<LiveDescriptor>(response.bodyAsText())
        204, 401, 403, 404 -> null
        else -> error("live: the channel could not be looked up (${response.status.value})")
    }
}
