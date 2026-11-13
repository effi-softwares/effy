package com.effyshopping.driver.mobile.core.offline

import com.effyshopping.mobile.kit.update.AppUpdateStore
import com.russhwolf.settings.Settings
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

/** 121: the update check's two values (the last settings file, the notice already shown) in the app's settings store. */
class SettingsAppUpdateStore(private val settings: Settings) : AppUpdateStore {
    override fun getString(key: String): String? = settings.getStringOrNull(key)

    override fun putString(key: String, value: String) = settings.putString(key, value)
}

/** Milliseconds since the epoch, for the update check's "is the saved answer fresh" (121). */
@OptIn(ExperimentalTime::class)
fun epochMillisNow(): Long = Clock.System.now().toEpochMilliseconds()
