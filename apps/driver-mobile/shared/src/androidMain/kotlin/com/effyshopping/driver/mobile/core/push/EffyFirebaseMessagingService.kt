package com.effyshopping.driver.mobile.core.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.effyshopping.driver.mobile.shared.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM service (050 US3). The framework instantiates it; it forwards a rotated token to the app's
 * listener ([TokenRefreshHolder]) so the device re-registers (FR-012). Registered in
 * androidApp/AndroidManifest.xml.
 *
 * ⚠ A message that arrives WHILE THE APP IS OPEN is handed here and the system shows nothing — so a
 * driver looking at a stop was never told a new round had been assigned. It is shown from here now.
 * A message that arrives while the app is closed is still shown by the system tray, as before.
 */
class EffyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        TokenRefreshHolder.listener?.invoke(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val shown = message.notification ?: return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.areNotificationsEnabled()) return // the driver said no (FR-019)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Work updates", NotificationManager.IMPORTANCE_HIGH),
            )
        }
        // Tapping it brings the app forward and tells it what kind of thing was tapped — the same
        // `type` the system tray hands over for a message shown while the app was closed.
        val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            message.data[PushOpen.EXTRA_TYPE]?.let { putExtra(PushOpen.EXTRA_TYPE, it) }
            message.data[PushOpen.EXTRA_ENTITY]?.let { putExtra(PushOpen.EXTRA_ENTITY, it) }
        }
        val id = message.messageId?.hashCode() ?: 0
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_effy_notify)
            .setContentTitle(shown.title)
            .setContentText(shown.body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .apply {
                if (open != null) {
                    setContentIntent(
                        PendingIntent.getActivity(
                            this@EffyFirebaseMessagingService, id, open,
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                        ),
                    )
                }
            }
            .build()
        manager.notify(id, notification)
    }

    private companion object {
        const val CHANNEL_ID = "driver_work_updates"
    }
}

/**
 * What a tapped notification carries into the app: the KIND of thing it was about and, for a round,
 * which one (backlog D4) — an id, never an address or an order.
 */
object PushOpen {
    /** The data keys the notifications worker sends (`dataFor` in `notifications/src/worker/copy.ts`). */
    const val EXTRA_TYPE = "type"
    const val EXTRA_ENTITY = "entityId"

    /** The tapped notification, taken OUT of [intent] so a rotation does not act on it twice. */
    fun consume(intent: Intent?): OpenedNotification? {
        val type = intent?.getStringExtra(EXTRA_TYPE) ?: return null
        val entity = intent.getStringExtra(EXTRA_ENTITY)
        intent.removeExtra(EXTRA_TYPE)
        intent.removeExtra(EXTRA_ENTITY)
        return OpenedNotification(type, entity)
    }
}
