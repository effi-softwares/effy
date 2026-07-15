package com.effyshopping.customer.mobile.core.config

import com.effyshopping.customer.mobile.config.BuildKonfig
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The app's build-time configuration (013 data-model § 7; FR-037/FR-042).
 *
 * Every value is baked in by BuildKonfig from a git-ignored `secrets.properties` (root build.gradle.kts,
 * which FAILS the build if any is missing — FR-041). NONE of it is a secret: a pool id / client id is a
 * NAME, not a key, and the app client has no client secret. Backend addresses are configuration, never
 * literals in code.
 */
object AppConfig {
    val cognitoUserPoolId: String get() = BuildKonfig.COGNITO_USER_POOL_ID
    val cognitoAppClientId: String get() = BuildKonfig.COGNITO_APP_CLIENT_ID
    val cognitoRegion: String get() = BuildKonfig.COGNITO_REGION

    /** Account / profile → the cold path (`edge-api/customer`). Where every account route in this app goes. */
    val edgeApiBaseUrl: String get() = BuildKonfig.EDGE_API_BASE_URL

    /** Commerce → the hot path (`core-api`). Nothing to call yet, but the routing law is structural (FR-036). */
    val coreApiBaseUrl: String get() = BuildKonfig.CORE_API_BASE_URL
}

/**
 * Builds the Amplify configuration as a single JSON STRING from [AppConfig] (research D12).
 *
 * There is NO `amplifyconfiguration.json` file anywhere — not generated, not shipped, nothing to
 * git-ignore. Both SDKs accept this same raw `amplify_outputs` string in code: Android via
 * `AmplifyOutputs.fromString(...)`, iOS via `Amplify.configure(with: .data(...))`. commonMain builds
 * it once; each platform entry point hands it to its SDK.
 *
 * Auth-only minimal shape — user pool + public app client (no identity pool, no client secret).
 */
fun buildAmplifyOutputsJson(): String =
    buildJsonObject {
        put("version", "1")
        put("auth", buildJsonObject {
            put("aws_region", AppConfig.cognitoRegion)
            put("user_pool_id", AppConfig.cognitoUserPoolId)
            put("user_pool_client_id", AppConfig.cognitoAppClientId)
        })
    }.toString()
