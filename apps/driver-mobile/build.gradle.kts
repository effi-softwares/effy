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
}

// ── Build-time configuration contract (049, per 013/014 D14) ───────────────────────────────────────
//
// Every value the driver app needs to reach an environment is supplied HERE, at build time, from a
// git-ignored `secrets.properties` (or environment variables, which win — so CI needs no file). None
// of it is committed, and NO `amplifyconfiguration.json` is shipped: the Amplify config string is
// built in code from these constants (D12).
//
// FR-041 — a MISSING key FAILS THE BUILD, naming what is missing, at CONFIGURATION time. BuildKonfig
// would happily bake in null/"" — so the check lives HERE, before it.
//
// FR-042 — none of these is a secret. A pool id / client id is a NAME, not a key. The app client has
// NO client secret (generate_secret = false). `scripts/mobile-guard.sh` asserts no key is secret-shaped.

val requiredKeys = listOf(
    "COGNITO_USER_POOL_ID",   // the DRIVER pool — a NAME, not a key
    "COGNITO_APP_CLIENT_ID",  // the DRIVER MOBILE client id — a NAME, not a key; NO client secret
    "COGNITO_REGION",
    "DRIVER_API_BASE_URL",    // edge-api/driver — the ONLY backend this app calls
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

// Exposed to the :shared module's BuildKonfig block (shared/build.gradle.kts).
extra["effyConfig"] = requiredKeys.associateWith { configValue(it)!! }
