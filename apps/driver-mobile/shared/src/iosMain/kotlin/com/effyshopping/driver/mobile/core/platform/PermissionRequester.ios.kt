package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import com.effyshopping.driver.mobile.core.push.requestNotificationPermission
import kotlinx.coroutines.launch

/**
 * iOS core-permission request, from the permission screen (the priming screen says why first). It asks for
 * notifications here - the one prompt iOS will not raise by itself at first use, and work updates are the
 * reason the screen exists. Camera and location are still asked **contextually** by their frameworks at
 * first use (camera at capture, location via CoreLocation), the iOS-idiomatic pattern.
 *
 * [onDone] fires whatever the answer: priming never blocks on a grant, and a refusal shows "Notifications
 * are off" on Today and Account (`NotificationsSetting.ios.kt`).
 */
@Composable
actual fun rememberCorePermissionRequester(onDone: () -> Unit): () -> Unit {
    val scope = rememberCoroutineScope()
    return {
        scope.launch {
            runCatching { requestNotificationPermission() }
            onDone()
        }
    }
}
