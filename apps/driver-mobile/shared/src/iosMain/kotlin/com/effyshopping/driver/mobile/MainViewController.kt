package com.effyshopping.driver.mobile

import androidx.compose.ui.window.ComposeUIViewController
import com.effyshopping.driver.mobile.app.App
import com.effyshopping.driver.mobile.app.AppContainer
import com.effyshopping.driver.mobile.core.auth.IosAuthBridge
import com.effyshopping.driver.mobile.core.auth.IosAuthDriver
import com.effyshopping.driver.mobile.core.config.AppConfig
import com.effyshopping.driver.mobile.core.observability.IosAnalyticsBridge
import com.effyshopping.driver.mobile.core.observability.IosAnalyticsDriver
import com.effyshopping.driver.mobile.core.observability.IosCrashBridge
import com.effyshopping.driver.mobile.core.observability.IosCrashReporter
import com.effyshopping.driver.mobile.core.platform.IosMapLauncher
import com.effyshopping.driver.mobile.core.platform.IosPlatformUiController
import platform.UIKit.UIViewController

/**
 * The iOS entry point (049). Swift builds an [IosAuthBridge] (over Amplify Swift, which Kotlin/Native
 * cannot call — D5) and hands it in; this wraps it in the common `AuthDriver` contract. See `iosApp/`.
 */
fun MainViewController(
    authBridge: IosAuthBridge,
    // 050 — observability bridges (Firebase Crashlytics + PostHog iOS). Push stays NoOp on iOS until
    // APNs is set up (Apple Developer account — docs/observability-apple-blockers.md).
    crashBridge: IosCrashBridge,
    analyticsBridge: IosAnalyticsBridge,
): UIViewController {
    val platformUiController = IosPlatformUiController()
    val container = AppContainer(
        authDriver = IosAuthDriver(authBridge),
        crashReporter = IosCrashReporter(crashBridge),
        analyticsDriver = IosAnalyticsDriver(analyticsBridge, AppConfig.posthogKey, AppConfig.posthogHost),
    )
    container.startObservability(analyticsConsented = true)
    val viewController = ComposeUIViewController {
        App(container, platformUiController, IosMapLauncher())
    }
    platformUiController.attach(viewController)
    return viewController
}
