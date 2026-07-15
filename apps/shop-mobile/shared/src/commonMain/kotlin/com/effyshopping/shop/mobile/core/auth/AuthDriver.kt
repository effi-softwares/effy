package com.effyshopping.shop.mobile.core.auth

import kotlinx.coroutines.flow.Flow

/**
 * The platform auth boundary for shop-mobile (014 contracts/auth-driver.contract.md; per 013 D5).
 *
 * ONE interface in commonMain; `AmplifyAuthDriver` on Android (Amplify Android), a Swift `IosAuthBridge`
 * on iOS wrapped by `IosAuthDriver` (Amplify Swift is unreachable from Kotlin/Native).
 *
 * ── The ABSENCES are the shop audience's rules made structural ──
 * There is NO sign-up (either route), NO password sign-in, NO account recovery, NO password write, and
 * NO global sign-out. Shop operators are admin-provisioned (009) and passwordless (Principle IV). The
 * ONLY credential flow is email → one-time code. Do not add methods here.
 */
interface AuthDriver {
    /** Emits when the SDK drops the session without the app asking (Amplify Android Keystore failure — 013 D11). */
    val sessionChanges: Flow<Unit>

    suspend fun currentSession(forceRefresh: Boolean = false): Session?

    /** The ONLY credential flow: email → code. */
    suspend fun signInWithEmailOtp(email: String): AuthStep   // → NeedsOtp(destination)
    suspend fun confirmOtp(code: String): AuthStep            // → Done(session)

    /** LOCAL sign-out — purge this device's tokens. */
    suspend fun signOut()
}
