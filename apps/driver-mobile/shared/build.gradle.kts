import com.codingfeline.buildkonfig.compiler.FieldSpec.Type.STRING
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.gradle.api.tasks.PathSensitivity

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
       namespace = "com.effyshopping.driver.mobile.shared"
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
        // 049 — the GENERATED, drift-guarded driver contract (from driver.ts) lives in shared-types;
        // the design theme is derived from the SAME tokens.css as every surface (one brand source,
        // Principle II/V) into a per-app package (`compose-driver`). The shared, audience-neutral mobile
        // navigation shell (mobile-kit) is consumed by all three mobile apps.
        commonMain {
            kotlin.srcDir(rootProject.file("../../packages/shared-types/contract-driver"))
            kotlin.srcDir(rootProject.file("../../packages/design-system/compose-driver"))
            kotlin.srcDir(rootProject.file("../../packages/mobile-kit/common"))
        }
        androidMain {
            kotlin.srcDir(rootProject.file("../../packages/mobile-kit/android"))
        }
        iosMain {
            kotlin.srcDir(rootProject.file("../../packages/mobile-kit/ios"))
        }

        androidMain.dependencies {
            // 060 — in-app camera viewfinder for photo proof (design screen `proof-photo`).
            // Android only: iOS gets the same designed chrome with a system-camera handoff until a
            // Swift AVFoundation bridge is written (research R8, plan Complexity Tracking).
            implementation(libs.androidx.camera.core)
            implementation(libs.androidx.camera.camera2)
            implementation(libs.androidx.camera.lifecycle)
            implementation(libs.androidx.camera.view)
            implementation(libs.androidx.core.ktx)
            implementation(libs.compose.uiToolingPreview)
            // 049 photo proof — the camera ActivityResult launcher (rememberLauncherForActivityResult).
            implementation(libs.androidx.activity.compose)
            implementation(libs.ktor.client.android)
            // Amplify ANDROID (Kotlin/JVM) + the Kotlin coroutines facade. iOS uses Amplify SWIFT (D5).
            implementation(libs.amplify.auth.cognito)
            implementation(libs.amplify.core.kotlin)
            // 050 — Firebase (FCM + Crashlytics) + PostHog: the Android actuals for the observability/push drivers.
            implementation(project.dependencies.platform(libs.firebase.bom))
            implementation(libs.firebase.messaging)
            implementation(libs.firebase.crashlytics)
            implementation(libs.posthog.android)
        }
        commonMain.dependencies {
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.animation)
            implementation(libs.compose.material3)
            // ⚠ 060 REMOVED MapLibre. It rendered real OpenStreetMap cartography and worked at
            // runtime, but aborted the app under Xcode's debug build (SIGABRT on its own render
            // thread, pre-1.0 threading between native callbacks and the Kotlin/Native runtime) —
            // not fixable here, and an app that cannot be Run from Xcode is not a workable basis
            // for developing this surface. The map is now the stylised route FR-023e always
            // recorded as the fallback. MapLibreAbsentGuardTest keeps it out.
            // 060 \u2014 the history record renders the ACTUAL captured proof photo. Before this it
            // printed "Photo/signature captured" and showed nothing, which is useless in the one
            // situation the record exists for: a customer disputing a delivery.
            implementation(libs.coil.compose)
            implementation(libs.coil.network.ktor3)
            implementation(libs.compose.material3.adaptive.navigation.suite)
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
            implementation(libs.multiplatform.settings)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.compose.uiTest)
            implementation(libs.multiplatform.settings.test)
        }
    }
}

// ── BuildKonfig — compile-time config from the root project's resolved contract (049, per 013/014) ─
@Suppress("UNCHECKED_CAST")
val effyConfig = rootProject.extra["effyConfig"] as Map<String, String>

buildkonfig {
    packageName = "com.effyshopping.driver.mobile.config"
    defaultConfigs {
        effyConfig.forEach { (key, value) -> buildConfigField(STRING, key, value) }
    }
}

dependencies {
    androidRuntimeClasspath(libs.compose.uiTooling)
}

compose.resources {
    packageOfResClass = "com.effyshopping.driver.mobile.resources"
}

// ── 060: source guards read files Gradle does not otherwise track ──────────────────────────────
//
// ⚠ FOUND BY THE NEGATIVE PROOF, not by reasoning. `PlaceholderRegisterGuardTest` reads
// `specs/060-driver-mobile-ui/provenance-register.md`, which lives OUTSIDE this Gradle project. It
// is therefore invisible to the up-to-date check: editing the register left the test task
// UP-TO-DATE and the guard simply did not run. The guard would have been silent in exactly the
// situation it exists for — someone changing the register and not the code.
//
// Declaring it as an input fixes that. `optional` so a checkout without the spec directory (or a
// future move of the file) degrades to "guard does not run" rather than "the build cannot
// configure".
tasks.withType<Test>().configureEach {
    inputs.file(rootProject.file("../../specs/060-driver-mobile-ui/provenance-register.md"))
        .withPropertyName("provenanceRegister")
        .withPathSensitivity(PathSensitivity.RELATIVE)
        .optional(true)
}
