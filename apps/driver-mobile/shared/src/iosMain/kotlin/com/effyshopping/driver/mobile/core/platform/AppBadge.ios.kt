package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import platform.UserNotifications.UNUserNotificationCenter

@Composable
actual fun rememberSetAppBadge(): (Int) -> Unit = remember {
    { count -> UNUserNotificationCenter.currentNotificationCenter().setBadgeCount(count.coerceAtLeast(0).toLong(), withCompletionHandler = null) }
}
