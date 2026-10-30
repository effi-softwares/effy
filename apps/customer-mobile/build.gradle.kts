import java.util.Properties

plugins {
    // this is necessary to avoid the plugins to be loaded multiple times
    // in each subproject's classloader
    alias(libs.plugins.androidApplication) apply false
    alias(libs.plugins.androidMultiplatformLibrary) apply false
    alias(libs.plugins.composeMultiplatform) apply false
    alias(libs.plugins.composeCompiler) apply false
    alias(libs.plugins.kotlinMultiplatform) apply false
    alias(libs.plugins.kotlinSerialization) apply false
    alias(libs.plugins.buildkonfig) apply false
    // Declared here so the plugin classpath is shared; applied only in:androidApp.
    alias(libs.plugins.googleServices) apply false
    alias(libs.plugins.firebaseCrashlytics) apply false
}

// Build-time configuration: every value the app needs to reach an environment comes from a git-ignored
// `secrets.properties` (or environment variables, which win, so CI needs no file). No
// `amplifyconfiguration.json` exists: the Amplify config is built in code from these constants.
//
// A missing key fails the build at configuration time, naming it (BuildKonfig would bake in null/"").
// `:shared` reads `rootProject.extra["effyConfig"]` into `buildkonfig { }`. None is a secret (pool and
// client ids are names; the app client has no secret); `scripts/mobile-guard.sh` refuses secret-shaped
// key names.

val requiredKeys = listOf(
    "COGNITO_USER_POOL_ID",   // a name, not a key
    "COGNITO_APP_CLIENT_ID",  // a name, not a key - and there is NO client secret
    "COGNITO_REGION",
    "EDGE_API_BASE_URL",      // the backend gateway - every route this app calls
    // Stripe publishable key (pk_…) - not a secret. Stripe designs it to ship in clients (it only
    // tokenizes cards against the account; the sk_… secret never leaves the backend - 019 R3). Each client
    // carries its own (config.go: the backend echo is "a convenience", not the source). Named …_KEY, so
    // mobile-guard allowlists exactly this one publishable key (the guard's FR-042 name check).
    "STRIPE_PUBLISHABLE_KEY",
)

val secretsFile = rootProject.file("secrets.properties") // git-ignored
val secretsProps = Properties().apply {
    if (secretsFile.exists()) secretsFile.inputStream().use { load(it) }
}

/** Environment variables win over the file, so CI never needs a checked-in `secrets.properties`. */
fun configValue(key: String): String? =
    (System.getenv(key) ?: secretsProps.getProperty(key))?.takeIf { it.isNotBlank() }

val missingKeys = requiredKeys.filter { configValue(it) == null }
if (missingKeys.isNotEmpty()) {
    throw GradleException(
        """
        |
        |╭─ customer-mobile: missing required build configuration ────────────────────────────────────
        |│ Missing: ${missingKeys.joinToString(", ")}
        |│
        |│ Set each in ${secretsFile.path} (git-ignored) or as an environment variable.
        |│ Template: apps/customer-mobile/secrets.properties.example
        |│ Values:   make output ENV=dev   ·   SSM /effy/<env>/auth/customer/* and /effy/<env>/edge/api_endpoint
        |╰────────────────────────────────────────────────────────────────────────────────────────────
        """.trimMargin()
    )
}

// Optional telemetry/push config. Unlike requiredKeys, a missing value here does not fail the
// build: it bakes in "" so the app runs with analytics/push as a no-op. The PostHog project
// key + host are non-secret (client-embeddable, like the Cognito ids); the FCM project id is non-secret.
// Values: SSM /effy/<env>/telemetry/* and /effy/<env>/notifications/fcm_project_id (make output ENV=dev).
val optionalKeys = listOf(
    "POSTHOG_KEY",        // phc_… - non-secret PostHog project key
    "POSTHOG_HOST",       // https://us.i.posthog.com | https://eu.i.posthog.com
    "TELEMETRY_ENABLED",  // "true" | "false" - analytics kill switch
    "DEBUG_TOOLS",        // "true" shows the in-app observability test panel. Never in prod.
)

// Exposed to the:shared module's BuildKonfig block. Required keys must be present (checked above);
// optional keys default to "" so telemetry stays a no-op until configured.
extra["effyConfig"] =
    requiredKeys.associateWith { configValue(it)!! } +
        optionalKeys.associateWith { configValue(it) ?: "" }
