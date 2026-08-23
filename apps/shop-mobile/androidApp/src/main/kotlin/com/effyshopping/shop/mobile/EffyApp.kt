package com.effyshopping.shop.mobile

import android.app.Application
import android.util.Log
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.auth.AmplifyAuthDriver
import com.effyshopping.shop.mobile.core.auth.AmplifyBootstrap
import com.effyshopping.shop.mobile.core.config.AppConfig
import com.effyshopping.shop.mobile.core.observability.AndroidCrashReporter
import com.effyshopping.shop.mobile.core.observability.PostHogAnalyticsDriver
import com.effyshopping.shop.mobile.core.push.FirebasePushTokenProvider

/**
 * The Android application. Configures Amplify ONCE (from the in-code config string — no
 * `amplifyconfiguration.json`, 013 D12) and owns the single [AppContainer] (Principle VI) so it
 * survives activity recreation rather than leaking a new coroutine scope per rotation.
 */
class EffyApp : Application() {

    val container: AppContainer by lazy {
        AppContainer(
            authDriver = AmplifyAuthDriver(),
            // 050 — Android observability/push drivers. Fail-open: empty PostHog key ⇒ analytics no-op;
            // Firebase auto-inits from google-services resources.
            crashReporter = AndroidCrashReporter(),
            analyticsDriver = PostHogAnalyticsDriver(
                context = applicationContext,
                apiKey = AppConfig.posthogKey,
                host = AppConfig.posthogHost,
            ),
            pushTokenProvider = FirebasePushTokenProvider(applicationContext),
        )
    }

    override fun onCreate() {
        super.onCreate()
        try {
            AmplifyBootstrap.configure(applicationContext)
        } catch (e: Exception) {
            // A config failure must not crash the app — the login screen still renders, and the driver's
            // currentSession() returns null, so the app lands on SignedOut. Never log tokens (FR-036).
            Log.e("EffyApp", "Amplify configuration failed: ${e.message}")
        }
        // 050 — crash reporting on (independent of analytics consent, Q1); analytics OFF until consent
        // (the internal consent posture + toggle is the follow-up). Off the main thread.
        container.startObservability(analyticsConsented = false)
    }
}
