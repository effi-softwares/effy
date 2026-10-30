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
        // 013 D15/D16 - the generated, committed, drift-guarded contract + theme live in the shared
        // packages (single source of truth: Ts / CSS). Include them as extra source roots rather than
        // copying, so there is exactly one copy and `contract:check` / `tokens:check` guard it.
        // Block form: inside `commonMain { }` the receiver is the KotlinSourceSet, so `kotlin.srcDir`
        // resolves (the `commonMain` provider has no `.kotlin` accessor).
        commonMain {
            kotlin.srcDir(rootProject.file("../../packages/shared-types/contract"))
            kotlin.srcDir(rootProject.file("../../packages/design-system/compose"))
            // The shared, audience-neutral mobile navigation shell (Principle II). Also gives the
            // customer app its first adaptive layer (WindowSize/AdaptiveContent were shop-only before).
            kotlin.srcDir(rootProject.file("../../packages/mobile-kit/common"))
        }

        // Mobile-kit gained its first platform-specific component (the one-time-code
        // field, whose iOS actual is a native UITextField so that
        // `UITextContentTypeOneTimeCode` autofill works at all). The package is therefore
        // split common/android/ios; each half is srcDir'd into the matching source set.
        androidMain {
            kotlin.srcDir(rootProject.file("../../packages/mobile-kit/android"))
            // The generated payment-provider Appearance, derived from tokens.css (Principle II).
            // Android-only: it imports com.stripe.android, so it must not go in the commonMain
            // `compose/` directory, which has to compile for iOS.
            kotlin.srcDir(rootProject.file("../../packages/design-system/compose-payment-android"))
        }
        iosMain {
            kotlin.srcDir(rootProject.file("../../packages/mobile-kit/ios"))
        }

        androidMain.dependencies {
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.ktor.client.android)
            // The in-app payment element. Compose-scoped, so it lives here beside the payment screen: a
            // platform-only SDK in the Android half of the shared module, like Amplify and Firebase.
            implementation(libs.stripe.android)
            // CIO engine - Coil's image loader only (not the data client). Avoids the platform-okhttp
            // "Unbalanced enter/exit" crash when Coil cancels an image job on LazyGrid scroll reuse.
            implementation(libs.ktor.client.cio)
            // Amplify android (Kotlin/JVM) + the Kotlin coroutines facade. iOS uses Amplify swift.
            implementation(libs.amplify.auth.cognito)
            implementation(libs.amplify.core.kotlin)
            // Firebase (FCM + Crashlytics) + PostHog: the Android `actual`s for CrashReporter /
            // AnalyticsDriver / PushTokenProvider. iOS keeps the NoOp defaults until its Swift bridges
            // land (Firebase has no Kotlin/Native support - same split as Amplify).
            implementation(project.dependencies.platform(libs.firebase.bom))
            implementation(libs.firebase.messaging)
            implementation(libs.firebase.crashlytics)
            implementation(libs.posthog.android)
        }
        commonMain.dependencies {
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.material3)
            implementation(libs.compose.material3.adaptive.navigation.suite)
            implementation(libs.compose.ui)
            implementation(libs.compose.ui.backhandler)
            implementation(libs.compose.components.resources)
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.lifecycle.viewmodel)
            implementation(libs.androidx.lifecycle.viewmodelCompose)
            implementation(libs.androidx.lifecycle.runtimeCompose)
            // Jetpack Navigation 3 (stable; Compose Multiplatform ships it for iOS). Not
            // `material3-adaptive-navigation3`: beta only, and mobile-kit's ResponsiveNavigation already gives the
            // bar/rail switch.
            implementation(libs.navigation3.ui)
            implementation(libs.lifecycle.viewmodel.navigation3)
            // Networking (one client per base URL), serialization, async, nav, prefs
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.websockets) // The live-update channel
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

// Compose resources package. Pinned explicitly rather than left to the default so the
// generated typography (packages/design-system/compose/EffyTypography.kt) can import the font
// accessors by a stable name. shop-mobile has had this since 018; customer-mobile did not, which is
// part of why it never rendered the platform typeface.
compose.resources {
    packageOfResClass = "com.effyshopping.customer.mobile.resources"
}

// BuildKonfig: bakes in the values the root build already checked (`rootProject.extra["effyConfig"]`).
// `defaultConfigs` only, so it emits plain `const val` in commonMain (K2 cannot `expect const val`).
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
