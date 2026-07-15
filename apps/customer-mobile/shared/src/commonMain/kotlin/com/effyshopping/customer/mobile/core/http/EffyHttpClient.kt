package com.effyshopping.customer.mobile.core.http

import com.effyshopping.customer.mobile.core.auth.Session
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

/** `X-Effy-Access-Token` — the second header of the two-token protocol (013 D2). Lowercase on the wire. */
const val ACCESS_TOKEN_HEADER = "X-Effy-Access-Token"

internal val effyJson = Json {
    ignoreUnknownKeys = true // be liberal in production; the strict check lives in contract tests
    explicitNulls = false    // omit null fields (e.g. a "set" PasswordWrite carries no currentPassword)
}

/**
 * ⚠ The two-token protocol (013 D2, contracts/edge-api-customer.contract.md).
 *
 * Account routes need the **ID token** as the bearer (the gateway authorizer pins the app-client id as
 * audience — the ID token's shape) AND the **access token** in `X-Effy-Access-Token` (Cognito's
 * privileged calls are access-token-authorized, relayed by the Lambda). The backend 401s if the two
 * `sub`s differ. Sending only one, or the wrong one as bearer, fails every account route.
 *
 * [sessionProvider] delegates to the AuthDriver — Amplify OWNS refresh, so we never refresh over HTTP
 * (D21). A guest (null session) sends no auth headers, which is correct for public routes.
 */
private fun effyTwoTokenAuth(sessionProvider: suspend () -> Session?) =
    createClientPlugin("EffyTwoTokenAuth") {
        onRequest { request, _ ->
            val session = sessionProvider() ?: return@onRequest
            request.header(HttpHeaders.Authorization, "Bearer ${session.idToken}")
            request.header(ACCESS_TOKEN_HEADER, session.accessToken)
        }
    }

/**
 * One client per base URL (the routing law, FR-036: edge for account, core for commerce). [debug]
 * gates request logging — NEVER `BODY` in release, and the Authorization header is redacted even in
 * debug (FR-038): no password, code, or token reaches a log.
 */
fun createHttpClient(
    baseUrl: String,
    sessionProvider: suspend () -> Session?,
    debug: Boolean = false,
): HttpClient = HttpClient(httpEngine()) {
    expectSuccess = false // we map non-2xx to AppError ourselves (see HttpErrors.kt)

    install(ContentNegotiation) { json(effyJson) }

    install(Logging) {
        level = if (debug) LogLevel.HEADERS else LogLevel.NONE
        sanitizeHeader { it == HttpHeaders.Authorization || it == ACCESS_TOKEN_HEADER }
    }

    install(HttpTimeout) {
        requestTimeoutMillis = 30_000
        connectTimeoutMillis = 10_000
    }

    install(effyTwoTokenAuth(sessionProvider))

    defaultRequest {
        url(baseUrl.ensureTrailingSlash())
        contentType(ContentType.Application.Json)
    }
}

private fun String.ensureTrailingSlash(): String = if (endsWith("/")) this else "$this/"
