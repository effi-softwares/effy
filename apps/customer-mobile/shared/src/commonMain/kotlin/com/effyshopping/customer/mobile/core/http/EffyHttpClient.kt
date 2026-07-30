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
 * Which token goes in `Authorization: Bearer` — and it is DIFFERENT for the two backends.
 *
 * ⚠ THIS IS NOT A PREFERENCE. The two paths verify tokens in genuinely different ways, and sending the
 * wrong one is an instant 401 on every request:
 *
 *  - **[Edge]** — the cold path sits behind an API Gateway JWT authorizer that pins the app-client id as
 *    the **audience**. Only an **ID token** carries `aud`, so the bearer must be the ID token. The access
 *    token rides along in `X-Effy-Access-Token` because Cognito's privileged calls (change password,
 *    global sign-out) are access-token-authorized and the Lambda relays it. This is 013's two-token
 *    protocol (D2, contracts/edge-api-customer.contract.md).
 *
 *  - **[Core]** — the hot path verifies the token itself, and it verifies an **ACCESS token**:
 *    `token_use == "access"` plus `client_id ∈ this pool's app clients` (see core-api
 *    `internal/platform/auth/verifier.go`). An ID token fails BOTH checks — its `token_use` is `"id"` and
 *    it has no `client_id` at all.
 *
 * ⚠⚠ Until 027 this file sent the ID token to BOTH, because one plugin served both clients. The
 * consequence was total and invisible: **every authenticated customer-mobile call to core-api answered
 * 401**, and had done since 019. Nothing caught it because 019's only such call was a best-effort cart
 * snapshot whose failure was discarded, and its checkout was never run on a device. `customer-web` was
 * unaffected — it sends `session.accessToken` to core, which is right, and is why the web cart worked
 * while the mobile one did not. See specs/027-customer-cart-sync/research.md R12.
 */
enum class BearerToken { Edge, Core }

/**
 * [sessionProvider] delegates to the AuthDriver — Amplify OWNS refresh, so we never refresh over HTTP
 * (D21). A guest (null session) sends no auth headers, which is correct for public routes.
 */
private fun effyAuth(bearer: BearerToken, sessionProvider: suspend () -> Session?) =
    createClientPlugin("EffyAuth") {
        onRequest { request, _ ->
            val session = sessionProvider() ?: return@onRequest
            authHeadersFor(bearer, session).forEach { (name, value) -> request.header(name, value) }
        }
    }

/**
 * Which auth headers a request carries. A PURE function, and separated from the plugin on purpose: this
 * choice was wrong for two slices and nothing could catch it, because it lived inside a Ktor plugin with
 * an `expect`/`actual` engine underneath and was therefore untestable. It is unit-tested now.
 */
internal fun authHeadersFor(bearer: BearerToken, session: Session): Map<String, String> = when (bearer) {
    BearerToken.Edge -> mapOf(
        HttpHeaders.Authorization to "Bearer ${session.idToken}",
        ACCESS_TOKEN_HEADER to session.accessToken,
    )
    // The hot path reads only the standard header, and it must be the ACCESS token. No second header:
    // core-api never looks at one, and sending a token nothing reads is a leak with no upside.
    BearerToken.Core -> mapOf(HttpHeaders.Authorization to "Bearer ${session.accessToken}")
}

/**
 * One client per base URL (the routing law, FR-036: edge for account, core for commerce). [debug]
 * gates request logging — NEVER `BODY` in release, and the Authorization header is redacted even in
 * debug (FR-038): no password, code, or token reaches a log.
 */
fun createHttpClient(
    baseUrl: String,
    sessionProvider: suspend () -> Session?,
    /** Which backend this client talks to — it decides which token is the bearer. See [BearerToken]. */
    bearer: BearerToken,
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

    install(effyAuth(bearer, sessionProvider))

    defaultRequest {
        url(baseUrl.ensureTrailingSlash())
        contentType(ContentType.Application.Json)
    }
}

private fun String.ensureTrailingSlash(): String = if (endsWith("/")) this else "$this/"
