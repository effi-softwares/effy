package com.effyshopping.customer.mobile

import androidx.compose.runtime.remember
import androidx.compose.ui.window.ComposeUIViewController
import com.effyshopping.customer.mobile.app.App
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.auth.IosAuthBridge
import com.effyshopping.customer.mobile.core.auth.IosAuthDriver
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.observability.IosAnalyticsBridge
import com.effyshopping.customer.mobile.core.observability.IosAnalyticsDriver
import com.effyshopping.customer.mobile.core.observability.IosCrashBridge
import com.effyshopping.customer.mobile.core.observability.IosCrashReporter

/**
 * The iOS entry point. Swift builds the bridges Kotlin/Native cannot call directly (D5) and hands them
 * in; this wraps each in its common driver contract. See `iosApp/`.
 *
 * ⚠ NO PAYMENT BRIDGE (051). Paying used to be "present the provider's modal sheet", which Swift had to
 * do — so a payment bridge came in here beside the auth one. The in-app element is embedded in Effy's
 * own screen instead, and Swift supplies it through `IosPaymentElementRegistry` at startup rather than
 * through this entry point.
 */
fun MainViewController(
    authBridge: IosAuthBridge,
    // 050 — observability bridges (Firebase Crashlytics + PostHog iOS). Push stays NoOp on iOS until
    // APNs is set up (Apple Developer account — see docs/observability-apple-blockers.md).
    crashBridge: IosCrashBridge,
    analyticsBridge: IosAnalyticsBridge,
) =
    ComposeUIViewController {
        // `remember` the container so a root recomposition does NOT rebuild it — a fresh AppContainer
        // means a fresh, EMPTY in-memory GuestCartStore, which is why the cart appeared to empty on iOS
        // when returning from checkout/sign-in. Android already holds one Application-scoped instance.
        val container = remember {
            AppContainer(
                authDriver = IosAuthDriver(authBridge),
                crashReporter = IosCrashReporter(crashBridge),
                analyticsDriver = IosAnalyticsDriver(analyticsBridge, AppConfig.posthogKey, AppConfig.posthogHost),
                // pushTokenProvider defaults to NoOp on iOS (APNs is Apple-account-gated).
            )
        }
        container.startObservability()
        App(container)
    }
