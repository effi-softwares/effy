package com.effyshopping.driver.mobile.core.auth

import kotlinx.coroutines.flow.Flow

/**
 * The platform auth boundary: `AmplifyAuthDriver` on Android, a Swift `IosAuthBridge` wrapped by
 * `IosAuthDriver` on iOS (Amplify Swift is unreachable from Kotlin/Native). Drivers are admin-provisioned and
 * passwordless: no sign-up, password sign-in, recovery, password write or global sign-out. The only flow is
 * email → one-time code. Do not add methods here.
 */
interface AuthDriver {
    /** Emits when the SDK drops the session without the app asking (Amplify Android Keystore failure - 013 D11). */
    val sessionChanges: Flow<Unit>

    suspend fun currentSession(forceRefresh: Boolean = false): Session?

    /**
     * Whether this device holds a sign-in, answered without the network (backlog C3). With no signal,
     * [currentSession] is null for a signed-in driver whose token needs refreshing; this tells that
     * apart from a device nobody has signed in on.
     */
    suspend fun holdsSignIn(): Boolean = currentSession() != null

    /** The only credential flow: email → code. */
    suspend fun signInWithEmailOtp(email: String): AuthStep   // → NeedsOtp(destination)
    suspend fun confirmOtp(code: String): AuthStep            // → Done(session)

    /** Local sign-out - purge this device's tokens. */
    suspend fun signOut()
}
