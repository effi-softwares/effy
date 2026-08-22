package com.effyshopping.driver.mobile.core.platform

/**
 * External-maps hand-off (049 US4, FR-022). The driver app does NOT provide turn-by-turn; it opens
 * the device's maps app directed to an address. `expect/actual` because launching a maps intent is
 * platform-specific (Android `Intent(ACTION_VIEW, geo:…)`, iOS `UIApplication.openURL(maps:…)`).
 */
interface MapLauncher {
    /** Open the device maps app navigating to a free-form address string. */
    fun navigateTo(address: String)
}

/** A no-op used in previews/tests and when no platform launcher is wired. */
class NoOpMapLauncher : MapLauncher {
    override fun navigateTo(address: String) {}
}
