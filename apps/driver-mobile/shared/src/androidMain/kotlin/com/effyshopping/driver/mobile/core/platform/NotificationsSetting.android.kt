package com.effyshopping.driver.mobile.core.platform

import android.content.Intent
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

@Composable
actual fun rememberTurnOnNotifications(): (() -> Unit)? {
    val context = LocalContext.current
    fun enabled() = NotificationManagerCompat.from(context).areNotificationsEnabled()
    var on by remember { mutableStateOf(enabled()) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { on = enabled() }
    if (on) return null
    return {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }
}
