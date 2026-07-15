package com.effyshopping.shop.mobile.core.http

import com.effyshopping.shop.mobile.core.auth.Session
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.api.createClientPlugin
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.header
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

internal val effyJson = Json {
    ignoreUnknownKeys = true // liberal in production; the strict check lives in contract tests
    explicitNulls = false
}

/**
 * ⚠ The SHOP token protocol (014 D2s): a SINGLE access token as the bearer.
 *
 * Unlike `edge-api/customer` (two-token), the shop service reads identity only from the gateway-verified
 * access-token claims and never calls Cognito — so `Authorization: Bearer <access token>` and **no**
 * `X-Effy-Access-Token`. The ID token is used client-side (display email) only, never sent here.
 * A signed-out caller sends no auth header. Amplify OWNS refresh (013 D21).
 */
private fun shopBearer(sessionProvider: suspend () -> Session?) =
    createClientPlugin("ShopBearer") {
        onRequest { request, _ ->
            val session = sessionProvider() ?: return@onRequest
            request.header(HttpHeaders.Authorization, "Bearer ${session.accessToken}")
        }
    }

/**
 * The one client, for `SHOP_API_BASE_URL` (cross-pool isolation, FR-029). [debug] gates request
 * logging — NEVER `BODY` in release, and the Authorization header is redacted even in debug (SC-013):
 * no code or credential reaches a log.
 */
fun createHttpClient(
    baseUrl: String,
    sessionProvider: suspend () -> Session?,
    debug: Boolean = false,
): HttpClient = HttpClient(httpEngine()) {
    expectSuccess = false // we map non-2xx to AppError ourselves (HttpErrors.kt)

    install(ContentNegotiation) { json(effyJson) }

    install(Logging) {
        level = if (debug) LogLevel.HEADERS else LogLevel.NONE
        sanitizeHeader { it == HttpHeaders.Authorization }
    }

    install(HttpTimeout) {
        requestTimeoutMillis = 30_000
        connectTimeoutMillis = 10_000
    }

    install(shopBearer(sessionProvider))

    defaultRequest {
        url(baseUrl.ensureTrailingSlash())
        contentType(ContentType.Application.Json)
    }
}

private fun String.ensureTrailingSlash(): String = if (endsWith("/")) this else "$this/"
