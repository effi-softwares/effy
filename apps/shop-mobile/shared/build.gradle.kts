import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.STRING
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidMultiplatformLibrary)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.buildkonfig)
}

kotlin {
    listOf(
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    androidLibrary {
       namespace = "com.effyshopping.shop.mobile.shared"
       compileSdk = libs.versions.android.compileSdk.get().toInt()
       minSdk = libs.versions.android.minSdk.get().toInt()

       compilerOptions {
           jvmTarget = JvmTarget.JVM_11
       }
       androidResources {
           enable = true
       }
       withHostTest {
           isIncludeAndroidResources = true
       }
    }

    sourceSets {
        // 014 D4s — the GENERATED, drift-guarded shop contract (from shop.ts) lives in shared-types;
        // the design theme is derived from the SAME tokens.css as 013 by the SAME generator (one brand
        // source, Principle II/V) into a per-app package (`compose-shop`). srcDir'd, block form (013).
        commonMain {
            kotlin.srcDir(rootProject.file("../../packages/shared-types/contract-shop"))
            kotlin.srcDir(rootProject.file("../../packages/design-system/compose-shop"))
            // 015 — the shared, audience-neutral mobile navigation shell (Principle II): adaptive
            // window sizing, the session gate, the NavKey serialization scaffold, and the deferred-intent
            // store. Consumed by BOTH mobile apps; each supplies only its routes/tabs/session mapping.
            kotlin.srcDir(rootProject.file("../../packages/mobile-kit"))
        }

        androidMain.dependencies {
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.ktor.client.android)
            // Amplify ANDROID (Kotlin/JVM) + the Kotlin coroutines facade. iOS uses Amplify SWIFT (D5).
            implementation(libs.amplify.auth.cognito)
            implementation(libs.amplify.core.kotlin)
        }
        commonMain.dependencies {
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.material3)
            implementation(libs.compose.ui)
            implementation(libs.compose.ui.backhandler)
            implementation(libs.compose.components.resources)
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.lifecycle.viewmodel)
            implementation(libs.androidx.lifecycle.viewmodelCompose)
            implementation(libs.androidx.lifecycle.runtimeCompose)
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.contentNegotiation)
            implementation(libs.ktor.client.logging)
            implementation(libs.ktor.serialization.json)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.coroutines.core)
            // 016 — device-local create-draft persistence (FR-012). The `-no-arg` variant exposes a common
            // `Settings()` factory (NSUserDefaults on iOS, SharedPreferences on Android) — no platform wiring.
            implementation(libs.multiplatform.settings)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
        }
    }
}

// ── BuildKonfig — compile-time config from the root project's resolved contract (014, per 013 D12/D14) ─
// The root build.gradle.kts FAILED the build if any key was missing (FR-035) and exposed the resolved
// values as `rootProject.extra["effyConfig"]`. `defaultConfigs` only (no `targetConfigs`, K2 limit).
// NONE is a secret (FR-036): pool/client ids are names.
@Suppress("UNCHECKED_CAST")
val effyConfig = rootProject.extra["effyConfig"] as Map<String, String>

buildkonfig {
    packageName = "com.effyshopping.shop.mobile.config"
    defaultConfigs {
        effyConfig.forEach { (key, value) -> buildConfigField(STRING, key, value) }
    }
}

dependencies {
    androidRuntimeClasspath(libs.compose.uiTooling)
}
