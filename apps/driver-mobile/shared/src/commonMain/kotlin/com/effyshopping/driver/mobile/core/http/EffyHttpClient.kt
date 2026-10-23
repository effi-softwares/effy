package com.effyshopping.driver.mobile.core.http

import com.effyshopping.driver.mobile.core.auth.Session
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
 * The bearer is the access token alone: the driver service reads identity from the gateway-verified claims
 * and never calls Cognito, so no `X-Effy-Access-Token`. A signed-out caller sends no auth header; Amplify
 * owns refresh.
 */
private fun driverBearer(sessionProvider: suspend () -> Session?) =
    createClientPlugin("DriverBearer") {
        onRequest { request, _ ->
            val session = sessionProvider() ?: return@onRequest
            request.header(HttpHeaders.Authorization, "Bearer ${session.accessToken}")
        }
    }

/**
 * Every 401 and 403 is reported to [onRejected]. The driver service answers 403 only from its guard
 * a driver who is disabled or not provisioned — so either status means the session is over.
 */
private fun rejectionHook(onRejected: () -> Unit) =
    createClientPlugin("Rejection") {
        onResponse { response ->
            if (response.status.value == 401 || response.status.value == 403) onRejected()
        }
    }

/**
 * The one client, for `DRIVER_API_BASE_URL` (cross-pool isolation, FR-029). [debug] gates request
 * logging — never `BODY` in release, and the Authorization header is redacted even in debug:
 * no code or credential reaches a log.
 */
fun createHttpClient(
    baseUrl: String,
    sessionProvider: suspend () -> Session?,
    debug: Boolean = false,
    onRejected: () -> Unit = {},
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

    install(driverBearer(sessionProvider))
    install(rejectionHook(onRejected))

    defaultRequest {
        url(baseUrl.ensureTrailingSlash())
        contentType(ContentType.Application.Json)
    }
}

private fun String.ensureTrailingSlash(): String = if (endsWith("/")) this else "$this/"
