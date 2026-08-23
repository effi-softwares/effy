package com.effyshopping.customer.mobile.core.observability

/**
 * Product analytics (050 US2; ARCHITECTURE.md §Product analytics). PostHog behind a platform boundary,
 * like [CrashReporter]: one interface in commonMain, a real implementation per target (Android =
 * posthog-android; iOS = a Swift bridge). Wired into [com.effyshopping.customer.mobile.app.AppContainer].
 *
 * ⚠ CONSENT-GATED for this public audience (Principle VII): [init] is called only after the customer
 * consents, and again gated by the platform kill switch. ⚠ NO PII: association is by the auth subject
 * id alone; event props carry ids + bounded enums only.
 *
 * Config (autocapture OFF, screen views emitted manually, identified-only, session replay OFF — R11)
 * lives in the platform implementation, not here.
 */
interface AnalyticsDriver {
    /** Initialise the SDK (idempotent). Called off the main thread on consent (performance, R11). */
    fun init()

    /** Emit a taxonomy event. A no-op until [init] has run. */
    fun capture(event: AnalyticsEvent)

    /** Convenience for the most common event. */
    fun screen(name: String) = capture(AnalyticsEvent.ScreenViewed(name))

    /** Associate subsequent events with the authenticated subject. `sub` only — never PII. */
    fun identify(sub: String)

    /** Clear identity on sign-out (no cross-account bleed). */
    fun reset()

    /** Stop/opt out of collection for this user (per-user opt-out, FR-023). */
    fun optOut()
}

/** Default when analytics is not configured/consented (iOS today, local dev). Fail-open no-op. */
object NoOpAnalyticsDriver : AnalyticsDriver {
    override fun init() {}
    override fun capture(event: AnalyticsEvent) {}
    override fun identify(sub: String) {}
    override fun reset() {}
    override fun optOut() {}
}
