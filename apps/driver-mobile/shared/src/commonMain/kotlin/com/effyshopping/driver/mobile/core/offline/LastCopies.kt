package com.effyshopping.driver.mobile.core.offline

import com.russhwolf.settings.Settings

/**
 * The last copy of the few reads the app needs to open with no signal (backlog C3): the driver's
 * record and Today. Unlike [LastRead] it survives the app being closed - a driver opening the app in a
 * loading dock saw the sign-in screen. Kept as the wire's JSON; cleared on sign-out, so a shared phone
 * never opens on the last driver's work.
 */
class LastCopies(private val settings: Settings) {
    fun put(key: String, json: String) = settings.putString(PREFIX + key, json)

    fun get(key: String): String? = settings.getStringOrNull(PREFIX + key)

    fun clear() {
        KEYS.forEach { settings.remove(PREFIX + it) }
    }

    companion object {
        const val ME = "me"
        const val TODAY = "today"
        private val KEYS = listOf(ME, TODAY)
        private const val PREFIX = "driver.lastcopy."
    }
}
