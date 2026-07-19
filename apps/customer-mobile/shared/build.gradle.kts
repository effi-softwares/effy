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
       namespace = "com.effyshopping.customer.mobile.shared"
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
        // 013 D15/D16 — the GENERATED, committed, drift-guarded contract + theme live in the shared
        // packages (single source of truth: TS / CSS). Include them as extra source roots rather than
        // copying, so there is exactly one copy and `contract:check` / `tokens:check` guard it.
        // Block form: inside `commonMain { }` the receiver is the KotlinSourceSet, so `kotlin.srcDir`
        // resolves (the `commonMain` provider has no `.kotlin` accessor).
        commonMain {
            kotlin.srcDir(rootProject.file("../../packages/shared-types/contract"))
            kotlin.srcDir(rootProject.file("../../packages/design-system/compose"))
            // 015 — the shared, audience-neutral mobile navigation shell (Principle II). Also gives the
            // customer app its FIRST adaptive layer (WindowSize/AdaptiveContent were shop-only before).
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
            // 013 — networking (one client per base URL), serialization, async, nav, prefs
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.contentNegotiation)
            implementation(libs.ktor.client.logging)
            implementation(libs.ktor.serialization.json)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.coil.compose)
            implementation(libs.coil.network.ktor3)
            implementation(libs.kotlinx.coroutines.core)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.kotlinx.coroutines.test)
        }
    }
}

// ── BuildKonfig — compile-time config from the root project's resolved contract (013 D12/D13/D14) ───
//
// The root build.gradle.kts already FAILED THE BUILD if any key was missing (FR-041) and exposed the
// resolved values as `rootProject.extra["effyConfig"]`. Here we only bake them in. `defaultConfigs`
// ONLY — no `targetConfigs` — so BuildKonfig emits plain `const val` in commonMain and avoids the K2
// `expect const val` limitation (D13). NONE of these is a secret (FR-042): pool/client ids are names.
@Suppress("UNCHECKED_CAST")
val effyConfig = rootProject.extra["effyConfig"] as Map<String, String>

buildkonfig {
    packageName = "com.effyshopping.customer.mobile.config"
    defaultConfigs {
        effyConfig.forEach { (key, value) -> buildConfigField(STRING, key, value) }
    }
}

dependencies {
    androidRuntimeClasspath(libs.compose.uiTooling)
}
