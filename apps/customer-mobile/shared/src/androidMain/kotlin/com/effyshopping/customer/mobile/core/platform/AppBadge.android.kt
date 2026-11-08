package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.NotificationManagerCompat

@Composable
actual fun rememberClearAppBadge(): () -> Unit {
    val context = LocalContext.current
    return remember(context) { { runCatching { NotificationManagerCompat.from(context).cancelAll() } } }
}
