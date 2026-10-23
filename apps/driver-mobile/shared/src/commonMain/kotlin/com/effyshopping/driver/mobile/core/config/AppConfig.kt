package com.effyshopping.driver.mobile.core.config

import com.effyshopping.driver.mobile.config.BuildKonfig
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The app's build-time configuration (014 data-model § 5; FR-032/FR-036). Every value is baked in by
 * BuildKonfig from a git-ignored `secrets.properties` (the root build fails if any is missing — FR-035).
 * None is a secret: a pool id / client id is a name, and the client has no client secret.
 */
object AppConfig {
    val cognitoUserPoolId: String get() = BuildKonfig.COGNITO_USER_POOL_ID       // the driver pool
    val cognitoAppClientId: String get() = BuildKonfig.COGNITO_APP_CLIENT_ID     // the driver mobile client
    val cognitoRegion: String get() = BuildKonfig.COGNITO_REGION

    /** `edge-api/driver` — the only backend this app calls (cross-pool isolation, Principle IV). */
    val driverApiBaseUrl: String get() = BuildKonfig.DRIVER_API_BASE_URL

    // Telemetry (optional — empty '' ⇒ no-op, FR-027)
    val posthogKey: String get() = BuildKonfig.POSTHOG_KEY
    val posthogHost: String get() = BuildKonfig.POSTHOG_HOST
    val telemetryEnabled: Boolean get() = BuildKonfig.TELEMETRY_ENABLED != "false"

    // Help contacts (optional — operator-supplied; null ⇒ the app says it is not set up)
    val dispatchPhone: String? get() = BuildKonfig.DISPATCH_PHONE.trim().ifEmpty { null }
    val hubDeskPhone: String? get() = BuildKonfig.HUB_DESK_PHONE.trim().ifEmpty { null }
    val handbookUrl: String? get() = BuildKonfig.HANDBOOK_URL.trim().ifEmpty { null }
}

/**
 * Builds the Amplify configuration as a single JSON string from [AppConfig]. No
 * `amplifyconfiguration.json` file — both SDKs accept this raw `amplify_outputs` string in code.
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
