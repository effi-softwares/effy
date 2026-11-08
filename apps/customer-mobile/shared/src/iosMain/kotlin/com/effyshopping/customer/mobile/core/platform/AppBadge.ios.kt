package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import platform.UserNotifications.UNUserNotificationCenter

@Composable
actual fun rememberClearAppBadge(): () -> Unit = remember {
    { UNUserNotificationCenter.currentNotificationCenter().setBadgeCount(0L, withCompletionHandler = null) }
}
