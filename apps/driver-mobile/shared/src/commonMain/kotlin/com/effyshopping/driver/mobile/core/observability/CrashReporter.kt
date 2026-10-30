package com.effyshopping.driver.mobile.core.observability

/**
 * Crash and non-fatal reporting: Firebase Crashlytics behind a platform boundary (Android SDK; iOS a Swift
 * bridge), wired in [com.effyshopping.driver.mobile.app.AppContainer]. Independent of analytics consent. No
 * PII beyond the record id.
 */
interface CrashReporter {
    /** Start reporting. Called off the main thread after first frame (performance, R11). */
    fun init()

    /** Associate reports with the signed-in subject; pass null on sign-out. `sub` only - never PII. */
    fun setSubject(sub: String?)

    /** Record a handled (non-fatal) error. `keys` are low-cardinality, non-PII breadcrumbs. */
    fun logNonFatal(throwable: Throwable, keys: Map<String, String> = emptyMap())
}

/**
 * The default when no platform reporter is injected (iOS today, and any misconfiguration). Fail-open:
 * the app runs perfectly with crash reporting as a no-op.
 */
object NoOpCrashReporter : CrashReporter {
    override fun init() {}
    override fun setSubject(sub: String?) {}
    override fun logNonFatal(throwable: Throwable, keys: Map<String, String>) {}
}
