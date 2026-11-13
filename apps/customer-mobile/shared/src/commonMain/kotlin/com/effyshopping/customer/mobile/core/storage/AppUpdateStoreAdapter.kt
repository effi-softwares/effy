package com.effyshopping.customer.mobile.core.storage

import com.effyshopping.mobile.kit.update.AppUpdateStore
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

/**
 * 121: the update check's two values (the last settings file, the notice already shown) in this app's own preference
 * store. Both are device facts the platform is not authoritative for, and neither decides access to anything Effy holds.
 */
class DevicePreferencesAppUpdateStore(private val preferences: DevicePreferences) : AppUpdateStore {
    override fun getString(key: String): String? = preferences.getString(key)

    override fun putString(key: String, value: String) = preferences.putString(key, value)
}

/** Milliseconds since the epoch, for the update check's "is the saved answer fresh" (121). */
@OptIn(ExperimentalTime::class)
fun epochMillisNow(): Long = Clock.System.now().toEpochMilliseconds()
