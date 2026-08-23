package com.effyshopping.driver.mobile.core.observability

/**
 * Crash & non-fatal error reporting (050 US1; ARCHITECTURE.md §Crash reporting). Firebase Crashlytics
 * behind a platform boundary, exactly like [com.effyshopping.driver.mobile.core.auth.AuthDriver]:
 * ONE interface in commonMain, a real implementation per target (Android = Firebase Android SDK; iOS =
 * a Swift bridge injected at the entry point). Wired into [com.effyshopping.driver.mobile.app.AppContainer].
 *
 * ⚠ INDEPENDENT OF ANALYTICS CONSENT (spec clarification Q1): crash reporting stays on for a customer
 * who declined analytics. ⚠ NO PII beyond the auth subject id — never an email, name, address, or any
 * value a shopper typed (Principle VII).
 */
interface CrashReporter {
    /** Start reporting. Called off the main thread after first frame (performance, R11). */
    fun init()

    /** Associate reports with the signed-in subject; pass null on sign-out. `sub` only — never PII. */
    fun setSubject(sub: String?)

    /** Record a handled (non-fatal) error. `keys` are low-cardinality, non-PII breadcrumbs. */
    fun logNonFatal(throwable: Throwable, keys: Map<String, String> = emptyMap())
}

/**
 * The default when no platform reporter is injected (iOS today, and any misconfiguration). Fail-open:
 * the app runs perfectly with crash reporting as a no-op (FR-005/FR-027).
 */
object NoOpCrashReporter : CrashReporter {
    override fun init() {}
    override fun setSubject(sub: String?) {}
    override fun logNonFatal(throwable: Throwable, keys: Map<String, String>) {}
}
