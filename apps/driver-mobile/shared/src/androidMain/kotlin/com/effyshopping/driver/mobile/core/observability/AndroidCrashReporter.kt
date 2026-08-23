package com.effyshopping.driver.mobile.core.observability

import com.google.firebase.crashlytics.FirebaseCrashlytics

/**
 * Android crash/non-fatal reporting via Firebase Crashlytics (050 US1). Injected into
 * [com.effyshopping.driver.mobile.app.AppContainer] by the Android entry point; iOS keeps
 * [NoOpCrashReporter] until its Swift bridge lands (Firebase has no Kotlin/Native support).
 *
 * ⚠ NO PII beyond the subject id (Principle VII). Firebase auto-initialises from the google-services
 * resources (the google-services plugin generates them from google-services.json), so there is nothing
 * to configure here — [init] only sets collection on.
 */
class AndroidCrashReporter : CrashReporter {
    private val crashlytics get() = FirebaseCrashlytics.getInstance()

    override fun init() {
        crashlytics.isCrashlyticsCollectionEnabled = true
    }

    override fun setSubject(sub: String?) {
        // Crashlytics has no "clear" — the empty string dissociates reports on sign-out.
        crashlytics.setUserId(sub ?: "")
    }

    override fun logNonFatal(throwable: Throwable, keys: Map<String, String>) {
        for ((k, v) in keys) crashlytics.setCustomKey(k, v)
        crashlytics.recordException(throwable)
    }
}
