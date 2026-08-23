package com.effyshopping.driver.mobile.core.platform

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Android external-maps hand-off (049 US4, FR-022). Opens the device maps app with a geo query, or
 * falls back to a generic maps web URL if no maps app handles the geo scheme.
 */
class AndroidMapLauncher(private val context: Context) : MapLauncher {
    override fun navigateTo(address: String) {
        val q = Uri.encode(address)
        val geo = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=$q")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(geo)
        } catch (e: Exception) {
            val web = Intent(Intent.ACTION_VIEW, Uri.parse("https://maps.google.com/?q=$q")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(web)
        }
    }
}
