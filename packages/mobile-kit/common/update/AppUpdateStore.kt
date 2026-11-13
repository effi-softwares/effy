package com.effyshopping.mobile.kit.update

import kotlinx.serialization.Serializable

/**
 * Where the update check keeps its two values on the phone (121). Each app adapts its own key-value store (the customer
 * app's `DevicePreferences`, the driver app's multiplatform-settings `Settings`), so mobile-kit depends on neither.
 */
interface AppUpdateStore {
    fun getString(key: String): String?

    fun putString(key: String, value: String)
}

/** The last file received, kept so a launch with no answer in time can still act (spec FR-009). */
@Serializable
data class SavedAnswer(val body: String, val etag: String? = null, val fetchedAtEpochMs: Long)

object AppUpdateKeys {
    const val SAVED = "app_update.saved"

    /** The latest build the notice was last shown for (written when shown, not when dismissed). */
    const val NOTICE_SHOWN_FOR = "app_update.notice_shown_for"

    /** The build the person was on when last prompted, so the first launch on a newer build can say it was updated. */
    const val PROMPTED_ON_BUILD = "app_update.prompted_on_build"
}

/** An in-memory store, for tests and previews. */
class InMemoryAppUpdateStore : AppUpdateStore {
    private val values = mutableMapOf<String, String>()

    override fun getString(key: String): String? = values[key]

    override fun putString(key: String, value: String) {
        values[key] = value
    }
}
