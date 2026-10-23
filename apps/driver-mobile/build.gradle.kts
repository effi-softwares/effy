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
    alias(libs.plugins.googleServices) apply false
    alias(libs.plugins.firebaseCrashlytics) apply false
}

// Build-time configuration: every value the app needs to reach an environment comes from a git-ignored
// `secrets.properties` (or environment variables, which win, so CI needs no file). No
// `amplifyconfiguration.json` exists: the Amplify config is built in code from these constants.
//
// A missing key fails the build at configuration time, naming it (BuildKonfig would bake in null/"").
// None is a secret (pool and client ids are names; the app client has no secret);
// `scripts/mobile-guard.sh` refuses secret-shaped key names.

val requiredKeys = listOf(
    "COGNITO_USER_POOL_ID",   // the driver pool — a name, not a key
    "COGNITO_APP_CLIENT_ID",  // the driver mobile client id — a name, not a key; NO client secret
    "COGNITO_REGION",
    "DRIVER_API_BASE_URL",    // edge-api/driver — the only backend this app calls
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
        |╭─ driver-mobile: missing required build configuration ──────────────────────────────────
        |│ Missing: ${missingKeys.joinToString(", ")}
        |│
        |│ Set each in ${secretsFile.path} (git-ignored) or as an environment variable.
        |│ Template: apps/driver-mobile/secrets.properties.example
        |│ Values:   make output ENV=dev   ·   SSM /effy/<env>/auth/driver/* and /effy/<env>/edge/api_endpoint
        |╰────────────────────────────────────────────────────────────────────────────────────────────
        """.trimMargin()
    )
}

// Exposed to the:shared module's BuildKonfig block (shared/build.gradle.kts).
//
// DISPATCH_PHONE / HUB_DESK_PHONE / HANDBOOK_URL are the Help screen's contacts. They are real-world
// identifiers a driver will dial, so they are operator-supplied and have no default: left blank, the
// app says the contact is not set up rather than showing a number nobody chose.
val optionalKeys = listOf(
    "POSTHOG_KEY", "POSTHOG_HOST", "TELEMETRY_ENABLED",
    "DISPATCH_PHONE", "HUB_DESK_PHONE", "HANDBOOK_URL",
)

// Optional telemetry config; missing values bake in "" so telemetry stays a no-op.
extra["effyConfig"] =
    requiredKeys.associateWith { configValue(it)!! } +
        optionalKeys.associateWith { configValue(it) ?: "" }
