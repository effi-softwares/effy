package com.effyshopping.customer.mobile.core.config

import com.effyshopping.customer.mobile.config.BuildKonfig
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The app's build-time configuration, baked in by BuildKonfig from a git-ignored `secrets.properties` (the
 * root build fails if any is missing). None is a secret. Backend addresses are configuration, never
 * literals.
 */
object AppConfig {
    val cognitoUserPoolId: String get() = BuildKonfig.COGNITO_USER_POOL_ID
    val cognitoAppClientId: String get() = BuildKonfig.COGNITO_APP_CLIENT_ID
    val cognitoRegion: String get() = BuildKonfig.COGNITO_REGION

    /** The backend gateway. Every route this app calls is behind it (storefront, commerce, customer). */
    val edgeApiBaseUrl: String get() = BuildKonfig.EDGE_API_BASE_URL

    /** The Stripe publishable key (`pk_…`): a name that only tokenizes cards; the secret never leaves the backend. */
    val stripePublishableKey: String get() = BuildKonfig.STRIPE_PUBLISHABLE_KEY

    // Telemetry/push (optional — empty ⇒ the capability is a no-op, FR-027)
    /** PostHog project key (phc_…). Non-secret/client-embeddable. Empty ⇒ analytics off. */
    val posthogKey: String get() = BuildKonfig.POSTHOG_KEY
    /** PostHog ingest host (us|eu). */
    val posthogHost: String get() = BuildKonfig.POSTHOG_HOST
    /** Analytics kill switch. Anything but the literal "false" (incl. empty) ⇒ enabled. */
    val telemetryEnabled: Boolean get() = BuildKonfig.TELEMETRY_ENABLED != "false"
    /** Show the in-app observability test panel (Privacy screen). Debug builds only. */
    val debugTools: Boolean get() = BuildKonfig.DEBUG_TOOLS == "true"

    /**
     * "Continue with Google" is shown only when true. False: federation is parked
     * (`customer_google_enabled = false`). Un-parking it means wiring native sign-in (hosted UI and the
     * app's callback scheme) and flipping this.
     */
    const val googleSignInEnabled: Boolean = false
}

/**
 * The Amplify configuration as one JSON string; there is no `amplifyconfiguration.json`. Both SDKs accept
 * the raw `amplify_outputs` string (Android `AmplifyOutputs.fromString`, iOS `Amplify.configure(with:
 * .data(...))`). Auth only: user pool and public app client.
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
