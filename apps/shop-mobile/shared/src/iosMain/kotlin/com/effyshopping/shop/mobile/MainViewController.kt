package com.effyshopping.shop.mobile

import androidx.compose.ui.window.ComposeUIViewController
import com.effyshopping.shop.mobile.app.App
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.auth.IosAuthBridge
import com.effyshopping.shop.mobile.core.auth.IosAuthDriver
import com.effyshopping.shop.mobile.core.config.AppConfig
import com.effyshopping.shop.mobile.core.observability.IosAnalyticsBridge
import com.effyshopping.shop.mobile.core.observability.IosAnalyticsDriver
import com.effyshopping.shop.mobile.core.observability.IosCrashBridge
import com.effyshopping.shop.mobile.core.observability.IosCrashReporter
import com.effyshopping.shop.mobile.core.platform.IosPlatformUiController
import platform.UIKit.UIViewController

/**
 * The iOS entry point. Swift builds a [IosAuthBridge] (over Amplify Swift, which Kotlin/Native cannot
 * call — 013 D5) and hands it in; this wraps it in the common [AuthDriver] contract. See `iosApp/`.
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
    container.startObservability(analyticsConsented = false)
    val viewController = ComposeUIViewController {
        App(container, platformUiController)
    }
    platformUiController.attach(viewController)
    return viewController
}
