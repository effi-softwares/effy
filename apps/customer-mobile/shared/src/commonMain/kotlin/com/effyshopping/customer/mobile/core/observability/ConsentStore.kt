package com.effyshopping.customer.mobile.core.observability

import com.effyshopping.customer.mobile.core.storage.DevicePreferences

/**
 * The customer's analytics-consent choice (050 US4, T030), persisted device-locally so it survives
 * relaunch and gates analytics init on every start (Principle VII — consent-respecting for the public
 * audience).
 *
 * ⚠ Governs PRODUCT ANALYTICS ONLY. Crash reporting is independent and always on (clarification Q1) —
 * this store never touches it. `UNKNOWN` (first run) means "not yet asked": analytics stays OFF until
 * the customer explicitly accepts, so nothing is collected without opt-in.
 */
enum class ConsentState { GRANTED, DENIED, UNKNOWN }

class ConsentStore(private val prefs: DevicePreferences) {
    fun state(): ConsentState = when (prefs.getString(KEY)) {
        "granted" -> ConsentState.GRANTED
        "denied" -> ConsentState.DENIED
        else -> ConsentState.UNKNOWN
    }

    fun set(state: ConsentState) {
        prefs.putString(
            KEY,
            when (state) {
                ConsentState.GRANTED -> "granted"
                ConsentState.DENIED -> "denied"
                ConsentState.UNKNOWN -> ""
            },
        )
    }

    private companion object {
        const val KEY = "effy_analytics_consent"
    }
}
