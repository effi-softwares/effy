package com.effyshopping.driver.mobile.core.observability

/**
 * Product analytics: PostHog behind a platform boundary like [CrashReporter] (Android posthog-android, iOS a
 * Swift bridge), wired in [com.effyshopping.driver.mobile.app.AppContainer]. [init] runs only with consent
 * and the platform kill switch on. No PII: the record id alone; props are ids and bounded enums.
 */
interface AnalyticsDriver {
    /** Initialise the SDK (idempotent). Called off the main thread on consent (performance, R11). */
    fun init()

    /** Emit a taxonomy event. A no-op until [init] has run. */
    fun capture(event: AnalyticsEvent)

    /** Convenience for the most common event. */
    fun screen(name: String) = capture(AnalyticsEvent.ScreenViewed(name))

    /** Associate subsequent events with the authenticated subject. `sub` only - never PII. */
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
