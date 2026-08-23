package com.effyshopping.driver.mobile.core.observability

import kotlinx.serialization.json.Json
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

/**
 * iOS observability bridges (050) — the SAME pattern as [core.auth.IosAuthBridge]: Swift implements a
 * plain protocol (Kotlin/Native cannot call the Firebase/PostHog iOS SDKs), and these Kotlin wrappers
 * adapt it back into the common [CrashReporter] / [AnalyticsDriver] contracts. Injected at the iOS
 * entry point (MainViewController). See iosApp/SwiftCrashBridge.swift + SwiftAnalyticsBridge.swift.
 *
 * ⚠ Bridge signatures use ONLY primitives (String / Boolean) — props travel as a JSON object string —
 * so there is no Kotlin-collection↔Swift-dictionary interop to get wrong.
 */

// ── Crash ──────────────────────────────────────────────────────────────────────────────────────
interface IosCrashBridge {
    fun setEnabled(enabled: Boolean)
    /** "" clears the association (sign-out). */
    fun setUserId(userId: String)
    /** keysJson is a JSON object of string→string breadcrumbs (may be "{}"). */
    fun recordNonFatal(message: String, keysJson: String)
}

class IosCrashReporter(private val bridge: IosCrashBridge) : CrashReporter {
    override fun init() = bridge.setEnabled(true)
    override fun setSubject(sub: String?) = bridge.setUserId(sub ?: "")
    override fun logNonFatal(throwable: Throwable, keys: Map<String, String>) {
        bridge.recordNonFatal(throwable.message ?: throwable.toString(), encodeStringMap(keys))
    }
}

// ── Analytics ──────────────────────────────────────────────────────────────────────────────────
interface IosAnalyticsBridge {
    fun setup(apiKey: String, host: String)
    /** propsJson is a JSON object of string→string. */
    fun capture(event: String, propsJson: String)
    fun identify(distinctId: String)
    fun reset()
    fun optOut()
}

class IosAnalyticsDriver(
    private val bridge: IosAnalyticsBridge,
    private val apiKey: String,
    private val host: String,
) : AnalyticsDriver {
    private var ready = false
    override fun init() {
        if (!ready && apiKey.isNotBlank()) {
            bridge.setup(apiKey, host)
            ready = true
        }
    }
    override fun capture(event: AnalyticsEvent) {
        if (ready) bridge.capture(event.name, encodeStringMap(event.props))
    }
    override fun identify(sub: String) { if (ready) bridge.identify(sub) }
    override fun reset() { if (ready) bridge.reset() }
    override fun optOut() { if (ready) bridge.optOut() }
}

private val mapJson = Json { encodeDefaults = true }
private fun encodeStringMap(m: Map<String, String>): String =
    mapJson.encodeToString(MapSerializer(String.serializer(), String.serializer()), m)
