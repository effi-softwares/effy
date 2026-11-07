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
 * FCM service. The framework instantiates it; it forwards a rotated token to the app's
 * listener ([TokenRefreshHolder]) so the device re-registers. Registered in
 * androidApp/AndroidManifest.xml.
 *
 * A message that arrives while the app is open is handed here and the system shows nothing - so a
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
        if (!manager.areNotificationsEnabled()) return // the driver said no
        ensureWorkUpdatesChannel(this)
        // Tapping it brings the app forward and tells it what kind of thing was tapped - the same
        // `type` the system tray hands over for a message shown while the app was closed.
        val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            for (key in PushOpen.EXTRAS) message.data[key]?.let { putExtra(key, it) }
        }
        val id = message.messageId?.hashCode() ?: 0
        val notification = NotificationCompat.Builder(this, WORK_UPDATES_CHANNEL_ID)
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
}

/** The one channel the app posts on. Its id is also the manifest's `default_notification_channel_id`. */
const val WORK_UPDATES_CHANNEL_ID = "driver_work_updates"

/**
 * Create the channel (idempotent). Called at app start too, so a message that arrives while the app is
 * closed finds it and FCM does not fall back to its own "Miscellaneous" channel.
 */
fun ensureWorkUpdatesChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
        NotificationChannel(WORK_UPDATES_CHANNEL_ID, "Work updates", NotificationManager.IMPORTANCE_HIGH),
    )
}

/**
 * What a tapped notification carries into the app (109): its type, its id and where it leads - never an address or
 * a stop. The keys are the push's data keys (specs/109-notification-record/contracts/push-payload.md).
 */
object PushOpen {
    const val EXTRA_TYPE = "type"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
    const val EXTRA_DESTINATION = "destination"
    val EXTRAS = listOf(EXTRA_TYPE, EXTRA_NOTIFICATION_ID, EXTRA_DESTINATION)

    /** The tapped notification, taken out of [intent] so a rotation does not act on it twice. */
    fun consume(intent: Intent?): OpenedNotification? {
        val type = intent?.getStringExtra(EXTRA_TYPE) ?: return null
        val opened = OpenedNotification(
            type = type,
            notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID)?.takeIf { it.isNotBlank() },
            destination = intent.getStringExtra(EXTRA_DESTINATION),
        )
        for (key in EXTRAS) intent.removeExtra(key)
        return opened
    }
}
