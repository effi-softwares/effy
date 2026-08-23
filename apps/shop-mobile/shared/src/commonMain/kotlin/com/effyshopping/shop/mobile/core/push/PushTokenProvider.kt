package com.effyshopping.shop.mobile.core.push

/**
 * Device push-token access (050 US3; ARCHITECTURE.md §Push). FCM behind a platform boundary, like the
 * auth/analytics drivers: one interface in commonMain, a real implementation per target (Android =
 * firebase-messaging; iOS = APNs↔FCM via a Swift bridge). Wired into
 * [com.effyshopping.shop.mobile.app.AppContainer]; the app registers the token with the cold-path
 * `/customer/v1/devices` endpoint and clears it on sign-out (FR-012/FR-020).
 *
 * ⚠ NO push without OS permission (FR-019). The token is opaque — no PII.
 */
interface PushTokenProvider {
    /** The current FCM token, or null if none/permission not granted. */
    suspend fun currentToken(): String?

    /** Request the OS notification permission; returns whether it was granted. */
    suspend fun requestPermission(): Boolean

    /** Register a callback invoked whenever the token rotates, so the app can re-register it. */
    fun onTokenRefresh(listener: (String) -> Unit)

    /** Delete the token from the device (sign-out / disable). */
    suspend fun deleteToken()
}

/** Default when push is not configured (iOS today, local dev). Fail-open: no token, no crash. */
object NoOpPushTokenProvider : PushTokenProvider {
    override suspend fun currentToken(): String? = null
    override suspend fun requestPermission(): Boolean = false
    override fun onTokenRefresh(listener: (String) -> Unit) {}
    override suspend fun deleteToken() {}
}
