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
        // 116 C6: a silent badge correction - take away what is no longer unseen, show nothing.
        BadgeCorrection.of(message.data)?.let { correction ->
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val shown = runCatching { manager.activeNotifications.toList() }.getOrDefault(emptyList())
            val gone = badgeCancellations(shown.map { it.tag }, correction).toSet()
            for (n in shown) if (n.tag in gone) manager.cancel(n.tag, n.id)
            return
        }
        val shown = message.notification ?: return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.areNotificationsEnabled()) return // the driver said no
        ensureNotificationChannels(this)
        val channel = channelFor(shown.channelId)
        // Tapping it brings the app forward and tells it what kind of thing was tapped - the same
        // `type` the system tray hands over for a message shown while the app was closed.
        val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            for (key in PushOpen.EXTRAS) message.data[key]?.let { putExtra(key, it) }
        }
        val id = message.messageId?.hashCode() ?: 0
        val notification = NotificationCompat.Builder(this, channel.id)
            .setSmallIcon(R.drawable.ic_stat_effy_notify)
            .setContentTitle(shown.title)
            .setContentText(shown.body)
            .setAutoCancel(true)
            .setPriority(if (channel.high) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
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
        // 116: tagged by its notification id, like the ones the system tray shows, so a correction can find it.
        manager.notify(message.data["notificationId"], id, notification)
    }
}

/**
 * The channels the app posts on, one per kind of message (111 R12; `NotificationCategoryPolicy.ANDROID_CHANNELS`), so a
 * person can mute one kind in the phone's settings without muting the rest. The server names the channel on each push;
 * the manifest's `default_notification_channel_id` is [NotificationCategoryPolicy.DEFAULT_CHANNEL].
 */
fun channelFor(id: String?): AndroidChannelSpec =
    NotificationCategoryPolicy.ANDROID_CHANNELS.firstOrNull { it.id == id }
        ?: NotificationCategoryPolicy.ANDROID_CHANNELS.first { it.id == NotificationCategoryPolicy.DEFAULT_CHANNEL }

/** The single channel used before 111. No installed builds keep it (cleanup rule), so it is simply removed. */
private const val OLD_CHANNEL_ID = "driver_work_updates"

/**
 * Create every channel (idempotent) and remove the old one. Called at app start too, so a message that arrives while
 * the app is closed finds its channel and FCM does not fall back to its own "Miscellaneous" channel.
 */
fun ensureNotificationChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannels(
        NotificationCategoryPolicy.ANDROID_CHANNELS.map { c ->
            NotificationChannel(c.id, c.name, if (c.high) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT)
        },
    )
    manager.deleteNotificationChannel(OLD_CHANNEL_ID)
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
