import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidMultiplatformLibrary)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
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
        // The shared Effy theme (generated from packages/design-system/src/tokens.css, the one brand
        // SSOT — Principle II/V) into the driver app's design package. Diff-guarded by tokens:check so
        // it can never drift from customer/shop/web.
        commonMain {
            kotlin.srcDir(rootProject.file("../../packages/design-system/compose-driver"))
        }
        androidMain.dependencies {
            implementation(libs.compose.uiToolingPreview)
        }
        commonMain.dependencies {
            implementation(libs.compose.runtime)
            implementation(libs.compose.foundation)
            implementation(libs.compose.material3)
            implementation(libs.compose.ui)
            implementation(libs.compose.components.resources)
            implementation(libs.compose.uiToolingPreview)
            implementation(libs.androidx.lifecycle.viewmodelCompose)
            implementation(libs.androidx.lifecycle.runtimeCompose)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
        }
    }
}

// The generated EffyTypography.kt imports Res + the font accessors from this package, so it must be
// pinned here exactly as customer-mobile and shop-mobile pin theirs. Without it the accessors are
// minted under a derived default package and the generated theme will not compile (026 T025a).
compose.resources {
    packageOfResClass = "com.effyshopping.driver.mobile.resources"
}

dependencies {
    androidRuntimeClasspath(libs.compose.uiTooling)
}