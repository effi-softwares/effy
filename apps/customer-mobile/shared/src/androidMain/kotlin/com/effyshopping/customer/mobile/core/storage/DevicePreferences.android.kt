package com.effyshopping.customer.mobile.core.storage

import android.content.Context
import android.content.SharedPreferences

/**
 * Android's store: `SharedPreferences`, in private mode.
 *
 * ⚠ The Context is injected once from `EffyApp.onCreate` rather than plumbed through every call, for
 * the same reason `AmplifyBootstrap` does it: the shared module's composables have no Context and
 * threading one down purely for a preference read would put an Android type in `commonMain`
 * signatures. `applicationContext` is used so this can never hold an Activity.
 */
private var appContext: Context? = null

/** Called once from `EffyApp.onCreate`. */
fun initDevicePreferences(context: Context) {
    appContext = context.applicationContext
}

private val prefs: SharedPreferences
    get() {
        val ctx = appContext
            ?: error(
                "DevicePreferences used before initDevicePreferences(context). " +
                    "Call it from EffyApp.onCreate.",
            )
        return ctx.getSharedPreferences("effy_customer_prefs", Context.MODE_PRIVATE)
    }

actual fun devicePreferences(): DevicePreferences = AndroidDevicePreferences

private object AndroidDevicePreferences : DevicePreferences {
    override fun getString(key: String): String? = prefs.getString(key, null)

    override fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun getBoolean(key: String, default: Boolean): Boolean = prefs.getBoolean(key, default)

    override fun putBoolean(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }
}
