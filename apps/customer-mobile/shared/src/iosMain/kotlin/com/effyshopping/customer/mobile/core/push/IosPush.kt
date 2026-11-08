package com.effyshopping.customer.mobile.core.push

import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import platform.UserNotifications.UNAuthorizationOptionAlert
import platform.UserNotifications.UNAuthorizationOptionBadge
import platform.UserNotifications.UNAuthorizationOptionSound
import platform.UserNotifications.UNUserNotificationCenter

/**
 * iOS push - the same bridge pattern as `IosCrashBridge` / `IosAnalyticsBridge`: Kotlin/Native cannot call
 * Firebase Messaging, so Swift implements this protocol (`iosApp/SwiftPushBridge.swift`) and
 * [IosPushTokenProvider] adapts it to the common [PushTokenProvider]. The APNs token itself is handed to
 * Firebase by `iosApp/AppDelegate.swift`; the OS permission is asked from Kotlin directly (UserNotifications
 * is callable from Kotlin/Native).
 *
 * ⚠ Until the app is signed with the push entitlement (a paid Apple Developer account - see
 * docs/observability-apple-blockers.md) Apple gives no APNs token, so Firebase gives no FCM token:
 * [currentToken] is null, nothing is registered, and everything else carries on.
 */
interface IosPushBridge {
    /** The FCM token, or "" when there is none (no APNs token yet - or ever, without the entitlement). */
    fun fetchToken(onResult: (String) -> Unit)

    /** [listener] is called with each new FCM token, including the first one once APNs answers. */
    fun setTokenListener(listener: (String) -> Unit)

    fun deleteToken(onDone: () -> Unit)
}

class IosPushTokenProvider(private val bridge: IosPushBridge) : PushTokenProvider {
    /**
     * Bounded: sign-in awaits this (`registerDeviceToken`), and with no APNs token Firebase's answer is not
     * guaranteed to be prompt. A token that turns up later reaches the backend through [onTokenRefresh].
     */
    override suspend fun currentToken(): String? = withTimeoutOrNull(TOKEN_WAIT_MS) {
        suspendCancellableCoroutine { cont ->
            bridge.fetchToken { token -> if (cont.isActive) cont.resume(token.ifBlank { null }) }
        }
    }

    override suspend fun requestPermission(): Boolean = requestNotificationPermission()

    override fun onTokenRefresh(listener: (String) -> Unit) = bridge.setTokenListener(listener)

    override suspend fun deleteToken() = suspendCancellableCoroutine { cont ->
        bridge.deleteToken { if (cont.isActive) cont.resume(Unit) }
    }
}

private const val TOKEN_WAIT_MS = 5_000L

/** Ask for alerts, sounds and badges. Answers at once (with the earlier choice) once asked before. */
suspend fun requestNotificationPermission(): Boolean = suspendCancellableCoroutine { cont ->
    UNUserNotificationCenter.currentNotificationCenter().requestAuthorizationWithOptions(
        UNAuthorizationOptionAlert or UNAuthorizationOptionSound or UNAuthorizationOptionBadge,
    ) { granted, _ -> if (cont.isActive) cont.resume(granted) }
}

/**
 * Where `AppDelegate.swift` reports a tapped notification. A tap can launch the app before the Compose
 * entry point has built its container, so the tap waits here until [attach] (called by MainViewController).
 * Called on the main thread only (UNUserNotificationCenter delivers its delegate calls there).
 */
object IosPushOpen {
    private var sink: ((OpenedNotification) -> Unit)? = null
    private var pending: OpenedNotification? = null

    /** The push's data keys (specs/109-notification-record/contracts/push-payload.md). */
    fun opened(type: String, notificationId: String?, destination: String?) {
        val opened = OpenedNotification(type, notificationId?.takeIf { it.isNotBlank() }, destination)
        sink?.invoke(opened) ?: run { pending = opened }
    }

    fun attach(sink: (OpenedNotification) -> Unit) {
        this.sink = sink
        pending?.let {
            pending = null
            sink(it)
        }
    }
}
