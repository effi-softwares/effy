package com.effyshopping.shop.mobile.core.auth

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * The iOS side of the auth boundary (013 D5). Kotlin/Native cannot call Amplify Swift, so Swift
 * implements the simple, callback-based [IosAuthBridge] (no `suspend`, no `Flow`), and THIS Kotlin
 * class adapts it to the common [AuthDriver] contract. Swift builds [IosAuthDriver] and hands it to
 * `MainViewController`.
 *
 * The interface's deliberate absences carry over unchanged — the bridge has ONLY the email-OTP flow,
 * no sign-up / password / recovery / global-sign-out method (014 FR-008/FR-028).
 */
class IosAuthDriver(private val bridge: IosAuthBridge) : AuthDriver {

    // iOS has no Android-Keystore failure mode, so nothing emits here — the Flow just stays idle.
    private val _sessionChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    override val sessionChanges: Flow<Unit> = _sessionChanges.asSharedFlow()

    override suspend fun currentSession(forceRefresh: Boolean): Session? =
        suspendCancellableCoroutine { cont ->
            bridge.fetchSession(forceRefresh) { s ->
                cont.resumeIfActive(s?.let { Session(it.sub, it.accessToken, it.idToken) })
            }
        }

    override suspend fun signInWithEmailOtp(email: String): AuthStep =
        mapResult(await { cb -> bridge.signInWithEmailOtp(email, cb) })

    override suspend fun confirmOtp(code: String): AuthStep =
        mapResult(await { cb -> bridge.confirmOtp(code, cb) })

    override suspend fun signOut() {
        suspendCancellableCoroutine<Unit> { cont -> bridge.signOut { cont.resumeIfActive(Unit) } }
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    private suspend fun await(register: ((BridgeAuthResult) -> Unit) -> Unit): BridgeAuthResult =
        suspendCancellableCoroutine { cont -> register { cont.resumeIfActive(it) } }

    private suspend fun mapResult(r: BridgeAuthResult): AuthStep = when (r.outcome) {
        "done" -> currentSession()?.let { AuthStep.Done(it) } ?: AuthStep.Failed(AuthError.Unexpected)
        "otp" -> AuthStep.NeedsOtp(r.destination ?: "your email")
        else -> AuthStep.Failed(mapErrorKind(r.errorKind))
    }

    private fun mapErrorKind(kind: String?): AuthError = when (kind) {
        "invalidCredentials" -> AuthError.InvalidCredentials
        "codeIncorrect" -> AuthError.CodeIncorrect
        "codeExpired" -> AuthError.CodeExpired
        "rateLimited" -> AuthError.RateLimited()
        "network" -> AuthError.Network
        else -> AuthError.Unexpected
    }

    private fun <T> CancellableContinuation<T>.resumeIfActive(value: T) {
        if (isActive) resume(value)
    }
}

/** A signed-in session, flattened for the Swift bridge (no expiry — Amplify owns refresh). */
data class BridgeSession(val sub: String, val accessToken: String, val idToken: String)

/**
 * A flat auth result the Swift bridge returns. [outcome] is one of `done` | `otp` | `failed`;
 * [errorKind] (on `failed`) is one of `invalidCredentials` | `codeIncorrect` | `codeExpired` |
 * `rateLimited` | `network` | `unexpected`. Kept primitive so Swift constructs it trivially.
 */
data class BridgeAuthResult(
    val outcome: String,
    val destination: String? = null,
    val errorKind: String? = null,
)

/**
 * The Swift-implemented bridge (013 D5). Plain callbacks — no `suspend`, no `Flow`, no Kotlin sealed
 * types on the wire — so a Swift `NSObject` can conform to it and call Amplify Swift. It has ONLY the
 * email-OTP flow and a local sign-out, mirroring [AuthDriver]'s absences (014 FR-008/FR-028).
 */
interface IosAuthBridge {
    fun fetchSession(forceRefresh: Boolean, onResult: (BridgeSession?) -> Unit)
    fun signInWithEmailOtp(email: String, onResult: (BridgeAuthResult) -> Unit)
    fun confirmOtp(code: String, onResult: (BridgeAuthResult) -> Unit)
    fun signOut(onResult: () -> Unit)
}
