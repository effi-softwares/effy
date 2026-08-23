package com.effyshopping.driver.mobile.core.push

import android.app.NotificationManager
import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Android FCM token access (050 US3). Injected into [com.effyshopping.driver.mobile.app.AppContainer]
 * by the Android entry point; iOS keeps [NoOpPushTokenProvider] until its APNs↔FCM Swift bridge lands.
 *
 * The token is opaque (no PII). Firebase auto-initialises from google-services resources, so there is
 * nothing to configure here. Token refresh is delivered by [EffyFirebaseMessagingService] → the
 * process-static holder this reads.
 */
class FirebasePushTokenProvider(private val context: Context) : PushTokenProvider {

    override suspend fun currentToken(): String? = suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            cont.resume(if (task.isSuccessful) task.result else null)
        }
    }

    /**
     * Whether notifications are enabled for the app. ⚠ On API 33+ the runtime POST_NOTIFICATIONS
     * prompt must be requested from an Activity (ActivityResult) — that Activity-level prompt is the
     * follow-up (same shape as the Stripe/payment Activity bridge); here we report current state so a
     * caller never pushes into a denied channel (FR-019).
     */
    override suspend fun requestPermission(): Boolean {
        // areNotificationsEnabled() exists since API 24 (== minSdk), so no compat lib is needed.
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return nm.areNotificationsEnabled()
    }

    override fun onTokenRefresh(listener: (String) -> Unit) {
        TokenRefreshHolder.listener = listener
    }

    override suspend fun deleteToken() {
        suspendCancellableCoroutine { cont ->
            FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener { cont.resume(Unit) }
        }
    }
}

/** Bridges [EffyFirebaseMessagingService.onNewToken] (framework-instantiated) to the app's listener. */
object TokenRefreshHolder {
    @Volatile
    var listener: ((String) -> Unit)? = null
}
