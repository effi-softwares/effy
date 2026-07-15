package com.effyshopping.shop.mobile.core.config

import com.effyshopping.shop.mobile.config.BuildKonfig
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The app's build-time configuration (014 data-model § 5; FR-032/FR-036). Every value is baked in by
 * BuildKonfig from a git-ignored `secrets.properties` (the root build fails if any is missing — FR-035).
 * NONE is a secret: a pool id / client id is a NAME, and the client has no client secret.
 */
object AppConfig {
    val cognitoUserPoolId: String get() = BuildKonfig.COGNITO_USER_POOL_ID       // the SHOP pool
    val cognitoAppClientId: String get() = BuildKonfig.COGNITO_APP_CLIENT_ID     // the SHOP MOBILE client
    val cognitoRegion: String get() = BuildKonfig.COGNITO_REGION

    /** `edge-api/shop` — the ONLY backend this app calls (cross-pool isolation, FR-029). */
    val shopApiBaseUrl: String get() = BuildKonfig.SHOP_API_BASE_URL
}

/**
 * Builds the Amplify configuration as a single JSON STRING from [AppConfig] (per 013 D12). No
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
