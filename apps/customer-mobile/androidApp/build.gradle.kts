import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    // 050 — google-services reads androidApp/google-services.json and generates the Firebase config
    // resources; crashlytics uploads the R8 mapping on release builds. The Firebase SDKs themselves
    // are declared in :shared/androidMain (where the expect/actual implementations live), not here.
    alias(libs.plugins.googleServices)
    alias(libs.plugins.firebaseCrashlytics)
}

// ── DEV release signing (shareable dev APK) ────────────────────────────────────────────────────────
//
// A release APK must be signed to install on a real phone. This reads a git-ignored
// `keystore.properties` (or environment variables of the same name, which win — so CI can inject its
// own). It is a DEV keystore for internal test builds ONLY — never the production upload key.
// Absent config → the release build stays UNSIGNED (and won't install), rather than failing the build,
// so other release tasks (lint, tests) still run without a keystore present. Create one: `make cm-keystore`.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}
fun signingValue(key: String): String? =
    (System.getenv(key) ?: keystoreProps.getProperty(key))?.takeIf { it.isNotBlank() }

val devSigningReady = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
    .all { signingValue(it) != null }

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_11
    }
}
dependencies {
    implementation(projects.shared)

    implementation(libs.androidx.activity.compose)

    // 024 — branded splash screen. Backports the Android 12+ SplashScreen API to API 21, so the
    // whole minSdk 24 range gets one mechanism (FR-012).
    implementation(libs.androidx.core.splashscreen)

    implementation(libs.compose.uiToolingPreview)
    debugImplementation(libs.compose.uiTooling)

    // 013 — Amplify Android requires core library desugaring (enabled in compileOptions below).
    coreLibraryDesugaring(libs.android.desugar.jdk.libs)

    // ⚠ NO STRIPE DEPENDENCY HERE (051). 019 put it in the app module because `PaymentSheet` had to be
    // registered against MainActivity's ActivityResultRegistry. The embedded element is Compose-scoped
    // and lives in `shared`'s androidMain with the payment screen, so the app module no longer needs it.
}

android {
    namespace = "com.effyshopping.customer.mobile"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.effyshopping.customer.mobile"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    signingConfigs {
        if (devSigningReady) {
            create("dev") {
                storeFile = rootProject.file(signingValue("storeFile")!!)
                storePassword = signingValue("storePassword")
                keyAlias = signingValue("keyAlias")
                keyPassword = signingValue("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            // Sign with the dev keystore when configured so the APK installs on a real device.
            if (devSigningReady) signingConfig = signingConfigs.getByName("dev")
        }
    }
    compileOptions {
        // 013 — required by Amplify Android (backports java.time etc. below the API level it needs).
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}