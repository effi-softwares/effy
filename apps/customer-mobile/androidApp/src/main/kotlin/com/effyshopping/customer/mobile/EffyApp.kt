package com.effyshopping.customer.mobile

import android.app.Application
import android.util.Log
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.auth.AmplifyAuthDriver
import com.effyshopping.customer.mobile.core.auth.AmplifyBootstrap
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.observability.AndroidCrashReporter
import com.effyshopping.customer.mobile.core.observability.PostHogAnalyticsDriver
import com.effyshopping.customer.mobile.core.payment.AndroidPaymentDriver
import com.effyshopping.customer.mobile.core.push.FirebasePushTokenProvider
import com.effyshopping.customer.mobile.core.storage.initDevicePreferences

/**
 * The Android application. Configures Amplify ONCE (from the in-code config string — no
 * `amplifyconfiguration.json`, D12) and owns the single [AppContainer] (Principle VI) so it survives
 * activity recreation rather than leaking a new coroutine scope per rotation.
 */
class EffyApp : Application() {

    val container: AppContainer by lazy {
        AppContainer(
            authDriver = AmplifyAuthDriver(),
            paymentDriver = AndroidPaymentDriver(),
            // 050 — the Android observability/push drivers. All fail-open: empty PostHog key ⇒ analytics
            // no-op; Firebase auto-inits from google-services resources.
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
        // 026: the device-local preference store needs an application Context once. It must be set
        // BEFORE any composition runs, because the very first screen (onboarding) reads it.
        initDevicePreferences(applicationContext)
        try {
            AmplifyBootstrap.configure(applicationContext)
        } catch (e: Exception) {
            // A config failure must not crash the app — the guest experience still works, and the
            // driver's currentSession() returns null, landing on Guest. Never log tokens (FR-038).
            Log.e("EffyApp", "Amplify configuration failed: ${e.message}")
        }
        // 050 — crash reporting always on (independent of analytics consent, Q1); analytics inits only
        // if the customer has GRANTED consent (startObservability reads the ConsentStore). The consent
        // banner + Account toggle drive the choice. Off the main thread (R11).
        container.startObservability()
    }
}
