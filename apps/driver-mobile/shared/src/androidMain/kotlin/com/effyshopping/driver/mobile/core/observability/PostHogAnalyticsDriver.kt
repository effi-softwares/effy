package com.effyshopping.driver.mobile.core.observability

import android.content.Context
import com.posthog.PostHog
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig

/**
 * Android product analytics via the PostHog SDK. Injected into
 * [com.effyshopping.driver.mobile.app.AppContainer] by the Android entry point; iOS keeps
 * [NoOpAnalyticsDriver] until its Swift bridge lands.
 *
 * Consent-gated: [init] is called only after the customer consents (AppContainer.setAnalyticsConsent
 * / startObservability). No PII: association by [identify] `sub` only; event props are ids/enums.
 *
 * Config choices: autocapture/screen-views off (we emit typed [AnalyticsEvent]s ourselves),
 * lifecycle events off, **session replay off**. Empty key ⇒ never initialised (no-op).
 */
class PostHogAnalyticsDriver(
    private val context: Context,
    private val apiKey: String,
    private val host: String,
) : AnalyticsDriver {
    private var ready = false

    override fun init() {
        if (ready || apiKey.isBlank()) return
        val config = PostHogAndroidConfig(apiKey = apiKey, host = host).apply {
            captureScreenViews = false
            captureDeepLinks = false
            captureApplicationLifecycleEvents = false
            sessionReplay = false
        }
        PostHogAndroid.setup(context, config)
        PostHog.register("surface", "driver-mobile")
        ready = true
    }

    override fun capture(event: AnalyticsEvent) {
        if (!ready) return
        PostHog.capture(event = event.name, properties = event.props)
    }

    override fun identify(sub: String) {
        if (!ready) return
        PostHog.identify(distinctId = sub)
    }

    override fun reset() {
        if (!ready) return
        PostHog.reset()
    }

    override fun optOut() {
        if (!ready) return
        PostHog.optOut()
    }
}
