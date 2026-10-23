package com.effyshopping.driver.mobile.core.platform

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Android external-maps hand-off. Opens the device maps app with a geo query, or
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

    override fun dial(phoneNumber: String) = 
        open(Uri.parse("tel:" + phoneNumber.filter { it.isDigit() || it == '+' }), Intent.ACTION_DIAL)

    override fun openLink(url: String) = open(Uri.parse(url), Intent.ACTION_VIEW)

    /** Nothing on the phone may handle it (a tablet with no dialler): that must not crash the app. */
    private fun open(uri: Uri, action: String) {
        runCatching { context.startActivity(Intent(action, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}
