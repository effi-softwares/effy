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
            implementation(libs.androidx.core.ktx)
            implementation(libs.compose.uiToolingPreview)
            // 049 photo proof — the camera ActivityResult launcher (rememberLauncherForActivityResult).
            implementation(libs.androidx.activity.compose)
            implementation(libs.ktor.client.android)
            // Amplify ANDROID (Kotlin/JVM) + the Kotlin coroutines facade. iOS uses Amplify SWIFT (D5).
            implementation(libs.amplify.auth.cognito)
            implementation(libs.amplify.core.kotlin)
        }
        commonMain.dependencies {
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.animation)
            implementation(libs.compose.material3)
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
