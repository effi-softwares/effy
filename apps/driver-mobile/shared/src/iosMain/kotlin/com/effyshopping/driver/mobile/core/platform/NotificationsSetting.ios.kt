package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.Foundation.NSURL
import platform.UIKit.UIApplication
import platform.UIKit.UIApplicationOpenNotificationSettingsURLString
import platform.UserNotifications.UNAuthorizationStatusDenied
import platform.UserNotifications.UNUserNotificationCenter

/**
 * Off means the driver said no (`denied`). Not asked yet is NOT off - the permission screen asks - so it
 * shows nothing, as Android shows nothing until a refusal. Re-checked each time the app comes back to the
 * foreground, so the row goes once they have turned notifications on in Settings.
 */
@Composable
actual fun rememberTurnOnNotifications(): (() -> Unit)? {
    var denied by remember { mutableStateOf(false) }
    var checks by remember { mutableIntStateOf(0) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { checks++ }
    LaunchedEffect(checks) { denied = notificationsDenied() }
    if (!denied) return null
    return {
        // This app's notification settings (iOS 16+; the app targets 18).
        NSURL(string = UIApplicationOpenNotificationSettingsURLString)?.let { UIApplication.sharedApplication.openURL(it) }
    }
}

private suspend fun notificationsDenied(): Boolean = suspendCancellableCoroutine { cont ->
    UNUserNotificationCenter.currentNotificationCenter().getNotificationSettingsWithCompletionHandler { settings ->
        if (cont.isActive) cont.resume(settings?.authorizationStatus == UNAuthorizationStatusDenied)
    }
}
