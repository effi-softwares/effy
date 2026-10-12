package com.effyshopping.driver.mobile.features.activity.data

import com.effyshopping.driver.mobile.features.activity.domain.ActivitySeen
import com.russhwolf.settings.Settings

/** [ActivitySeen] in the phone's preferences, so "new" survives closing the app. */
class SettingsActivitySeen(private val settings: Settings) : ActivitySeen {
    override fun lastSeen(): String? = settings.getStringOrNull(KEY)

    override fun markSeen(createdAt: String) {
        // Only ever forwards: a late-arriving older item must not make read items new again.
        if (createdAt > (lastSeen() ?: "")) settings.putString(KEY, createdAt)
    }

    private companion object {
        const val KEY = "driver.activity.seen.v1"
    }
}
