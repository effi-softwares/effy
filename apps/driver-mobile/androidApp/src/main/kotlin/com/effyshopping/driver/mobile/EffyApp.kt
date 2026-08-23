package com.effyshopping.driver.mobile

import android.app.Application
import android.util.Log
import com.effyshopping.driver.mobile.app.AppContainer
import com.effyshopping.driver.mobile.core.auth.AmplifyAuthDriver
import com.effyshopping.driver.mobile.core.auth.AmplifyBootstrap
import com.effyshopping.driver.mobile.core.config.AppConfig
import com.effyshopping.driver.mobile.core.observability.AndroidCrashReporter
import com.effyshopping.driver.mobile.core.observability.PostHogAnalyticsDriver
import com.effyshopping.driver.mobile.core.push.FirebasePushTokenProvider

/**
 * The Android application (049). Configures Amplify ONCE from the in-code config string (no
 * `amplifyconfiguration.json`, D12) and owns the single [AppContainer] (Principle VI) so it survives
 * activity recreation rather than leaking a coroutine scope per rotation.
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
            // A config failure must not crash the app — the sign-in screen still renders, and
            // currentSession() returns null, so the app lands on SignedOut. Never log tokens.
            Log.e("EffyApp", "Amplify configuration failed: ${e.message}")
        }
        // 050 — crash reporting on (independent of analytics consent, Q1); analytics ON by default for this
        // INTERNAL audience (employees, disclosed — clarification Q4; no opt-out UI this slice). Off-thread.
        container.startObservability(analyticsConsented = true)
    }
}
