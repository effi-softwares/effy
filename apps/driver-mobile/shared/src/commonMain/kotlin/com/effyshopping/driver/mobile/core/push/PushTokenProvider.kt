package com.effyshopping.driver.mobile.core.push

/**
 * Device push-token access: FCM behind a platform boundary (Android firebase-messaging; iOS APNs↔FCM via a
 * Swift bridge), wired in [com.effyshopping.driver.mobile.app.AppContainer]. The app registers the token at
 * `/driver/v1/devices` and clears it on sign-out. No push without OS permission; the token is opaque.
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
