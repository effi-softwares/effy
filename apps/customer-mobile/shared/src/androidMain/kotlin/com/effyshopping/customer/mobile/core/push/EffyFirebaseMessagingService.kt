package com.effyshopping.customer.mobile.core.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.effyshopping.customer.mobile.shared.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM service. The framework instantiates it; it forwards a rotated token to the app's
 * listener ([TokenRefreshHolder]) so the device re-registers. Registered in androidApp/AndroidManifest.xml.
 *
 * A message that arrives while the app is open is handed here and the system shows nothing, so it is
 * shown from here - "Out for delivery" must not be swallowed because the shopper was browsing. A message
 * that arrives while the app is closed is shown by the system tray, on the same channel (the manifest's
 * `default_notification_channel_id`), and its data keys arrive as the launch intent's extras - so both
 * paths reach [PushOpen] the same way.
 */
class EffyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        TokenRefreshHolder.listener?.invoke(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val shown = message.notification ?: return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.areNotificationsEnabled()) return // the shopper said no
        ensureOrderUpdatesChannel(this)
        // Tapping it brings the app forward with the same extras the system tray hands over.
        val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            message.data[PushOpen.EXTRA_TYPE]?.let { putExtra(PushOpen.EXTRA_TYPE, it) }
            message.data[PushOpen.EXTRA_DEEP_LINK]?.let { putExtra(PushOpen.EXTRA_DEEP_LINK, it) }
        }
        val id = message.messageId?.hashCode() ?: 0
        val notification = NotificationCompat.Builder(this, ORDER_UPDATES_CHANNEL_ID)
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
const val ORDER_UPDATES_CHANNEL_ID = "customer_order_updates"

/**
 * Create the channel (idempotent). Called at app start too, so a message that arrives while the app is
 * closed finds it and FCM does not fall back to its own "Miscellaneous" channel.
 */
fun ensureOrderUpdatesChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
        NotificationChannel(ORDER_UPDATES_CHANNEL_ID, "Order updates", NotificationManager.IMPORTANCE_HIGH),
    )
}

/**
 * What a tapped notification carries into the app: its type and the deep link the worker sent - routing
 * only, never an address or an amount.
 */
object PushOpen {
    /** The data keys the notifications worker sends (`dataFor` in `notifications/src/worker/copy.ts`). */
    const val EXTRA_TYPE = "type"
    const val EXTRA_DEEP_LINK = "deepLink"

    /** The tapped notification, taken out of [intent] so a rotation does not act on it twice. */
    fun consume(intent: Intent?): OpenedNotification? {
        val type = intent?.getStringExtra(EXTRA_TYPE) ?: return null
        val deepLink = intent.getStringExtra(EXTRA_DEEP_LINK)
        intent.removeExtra(EXTRA_TYPE)
        intent.removeExtra(EXTRA_DEEP_LINK)
        return OpenedNotification(type, deepLink)
    }
}
