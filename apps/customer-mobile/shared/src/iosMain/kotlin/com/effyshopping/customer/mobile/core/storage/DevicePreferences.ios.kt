package com.effyshopping.customer.mobile.core.storage

import platform.Foundation.NSUserDefaults

/**
 * iOS's store: `NSUserDefaults.standardUserDefaults`.
 *
 * No initialisation step is needed — unlike Android, the platform supplies the container itself, so
 * there is no iOS counterpart to `initDevicePreferences`.
 */
actual fun devicePreferences(): DevicePreferences = IosDevicePreferences

private object IosDevicePreferences : DevicePreferences {
    private val defaults get() = NSUserDefaults.standardUserDefaults

    override fun getString(key: String): String? = defaults.stringForKey(key)

    override fun putString(key: String, value: String) {
        defaults.setObject(value, forKey = key)
    }

    /**
     * ⚠ `boolForKey` returns `false` for an ABSENT key, which is indistinguishable from a stored
     * `false`. Checking `objectForKey` first is what makes a non-false [default] actually honoured —
     * without it, `getBoolean(key, default = true)` would wrongly return false on first launch.
     */
    override fun getBoolean(key: String, default: Boolean): Boolean =
        if (defaults.objectForKey(key) == null) default else defaults.boolForKey(key)

    override fun putBoolean(key: String, value: Boolean) {
        defaults.setBool(value, forKey = key)
    }
}
