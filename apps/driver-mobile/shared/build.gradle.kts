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
        // The generated, drift-guarded driver contract (from driver.ts) lives in shared-types;
        // the design theme is derived from the same tokens.css as every surface (one brand source,
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
            // In-app camera viewfinder for photo proof (design screen `proof-photo`).
            // Android only: iOS gets the same designed chrome with a system-camera handoff until a
            // swift AVFoundation bridge is written (research R8, plan Complexity Tracking).
            implementation(libs.androidx.camera.core)
            implementation(libs.androidx.camera.camera2)
            implementation(libs.androidx.camera.lifecycle)
            implementation(libs.androidx.camera.view)
            // Reading package labels (QR + Code 128) from the CameraX stream.
            implementation(libs.mlkit.barcode.scanning)
            implementation(libs.androidx.core.ktx)
            implementation(libs.compose.uiToolingPreview)
            // Photo proof - the camera ActivityResult launcher (rememberLauncherForActivityResult).
            implementation(libs.androidx.activity.compose)
            implementation(libs.ktor.client.android)
            // CIO holds the live channel's WebSocket. Not the data client's engine, and not OkHttp.
            implementation(libs.ktor.client.cio)
            // Amplify android (Kotlin/JVM) + the Kotlin coroutines facade. iOS uses Amplify swift.
            implementation(libs.amplify.auth.cognito)
            implementation(libs.amplify.core.kotlin)
            // Firebase (FCM + Crashlytics) + PostHog: the Android actuals for the observability/push drivers.
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
            // No MapLibre: it aborted the app under Xcode's debug build (SIGABRT on its render thread). The map is a
            // drawn schematic; MapLibreAbsentGuardTest keeps it out. Coil renders the captured proof photo in a
            // delivery's record.
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
            implementation(libs.ktor.client.websockets) // The live-update channel
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

// BuildKonfig - compile-time config from the root project's resolved contract
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

// Source guards read files Gradle does not otherwise track: `PlaceholderRegisterGuardTest` reads
// `specs/060-driver-mobile-ui/provenance-register.md`, declared as an input so editing it re-runs the
// test. `optional`, so a checkout without it skips the guard rather than failing to configure.
tasks.withType<Test>().configureEach {
    inputs.file(rootProject.file("../../specs/060-driver-mobile-ui/provenance-register.md"))
        .withPropertyName("provenanceRegister")
        .withPathSensitivity(PathSensitivity.RELATIVE)
        .optional(true)
}
