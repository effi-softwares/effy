package com.effyshopping.customer.mobile.core.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM service. The framework instantiates it; it forwards a rotated token to the app's
 * listener ([TokenRefreshHolder]) so the device re-registers.
 *
 * Backgrounded `notification`-payload messages are displayed by the system tray automatically. A
 * foreground display path + notification-tap → in-app deep-link routing is the app-side
 * follow-up; it needs the Compose navigator, so it does not belong in this framework service.
 * Registered in androidApp/AndroidManifest.xml.
 */
class EffyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        TokenRefreshHolder.listener?.invoke(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Intentionally minimal: the system displays notification-payload messages when backgrounded.
        // Foreground display is the app-side follow-up.
    }
}
