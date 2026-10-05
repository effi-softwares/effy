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
 * [sessionProvider] delegates to the AuthDriver — Amplify OWNS refresh, so we never refresh over HTTP
 * (D21). A guest (null session) sends no auth headers, which is correct for public routes.
 */
private fun effyAuth(sessionProvider: suspend () -> Session?) =
    createClientPlugin("EffyAuth") {
        onRequest { request, _ ->
            val session = sessionProvider() ?: return@onRequest
            authHeadersFor(session).forEach { (name, value) -> request.header(name, value) }
        }
    }

/**
 * Which auth headers a request carries.
 *
 * The backend sits behind an API Gateway JWT authorizer that pins the app-client id as the
 * **audience**. Only an **ID token** carries `aud`, so the bearer is the ID token. The access token
 * rides along in `X-Effy-Access-Token` because Cognito's privileged calls (change password, global
 * sign-out) are access-token-authorized and the backend relays it (013's two-token protocol, D2).
 *
 * ⚠ A PURE function, separated from the plugin on purpose. Until 070 there were TWO backends that
 * wanted DIFFERENT bearers, and for two slices this file sent the wrong one to the second: every
 * authenticated commerce call from this app answered 401 from 019 until 027, silently, because the
 * choice lived inside a Ktor plugin nothing could test. There is one backend and one answer now —
 * and it stays a tested function, because "which token" is exactly the kind of thing that is wrong
 * without anything failing.
 */
internal fun authHeadersFor(session: Session): Map<String, String> = mapOf(
    HttpHeaders.Authorization to "Bearer ${session.idToken}",
    ACCESS_TOKEN_HEADER to session.accessToken,
)

/**
 * The client for the backend gateway. [debug]
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

    install(effyAuth(sessionProvider))

    defaultRequest {
        url(baseUrl.ensureTrailingSlash())
        contentType(ContentType.Application.Json)
    }
}

private fun String.ensureTrailingSlash(): String = if (endsWith("/")) this else "$this/"
