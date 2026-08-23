package com.effyshopping.shop.mobile.core.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM service (050 US3). The framework instantiates it; it forwards a rotated token to the app's
 * listener ([TokenRefreshHolder]) so the device re-registers (FR-012).
 *
 * Backgrounded `notification`-payload messages are displayed by the system tray automatically. A
 * foreground display path + notification-tap → in-app deep-link routing (FR-017) is the app-side
 * follow-up (T047); it needs the Compose navigator, so it does not belong in this framework service.
 * Registered in androidApp/AndroidManifest.xml.
 */
class EffyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        TokenRefreshHolder.listener?.invoke(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Intentionally minimal: the system displays notification-payload messages when backgrounded.
        // Foreground display is the app-side follow-up (T047).
    }
}
