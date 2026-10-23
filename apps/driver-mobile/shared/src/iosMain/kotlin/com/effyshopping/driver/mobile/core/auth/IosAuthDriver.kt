package com.effyshopping.driver.mobile.core.auth

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * The iOS side of the auth boundary. Kotlin/Native cannot call Amplify Swift, so Swift
 * implements the simple, callback-based [IosAuthBridge] (no `suspend`, no `Flow`), and this Kotlin
 * class adapts it to the common [AuthDriver] contract. Swift builds [IosAuthDriver] and hands it to
 * `MainViewController`.
 *
 * The interface's deliberate absences carry over unchanged — the bridge has only the email-OTP flow,
 * no sign-up / password / recovery / global-sign-out method.
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

    /** Answered from the device's stored credentials, so it works with no signal (backlog C3). */
    override suspend fun holdsSignIn(): Boolean =
        suspendCancellableCoroutine { cont -> bridge.holdsSignIn { cont.resumeIfActive(it) } }

    override suspend fun signInWithEmailOtp(email: String): AuthStep =
        mapResult(await { cb -> bridge.signInWithEmailOtp(email, cb) })

    override suspend fun confirmOtp(code: String): AuthStep =
        mapResult(await { cb -> bridge.confirmOtp(code, cb) })

    override suspend fun signOut() {
        suspendCancellableCoroutine<Unit> { cont -> bridge.signOut { cont.resumeIfActive(Unit) } }
    }

    // helpers

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
 * A flat auth result the Swift bridge returns.
 *
 * Deliberately did not add a fourth outcome for the custom challenge. `otp` now covers both
 * Cognito's managed factor and the platform's own 6-digit challenge, because to this app they mean
 * the same thing — "a code was emailed, ask for it". A separate constant would have to be added in
 * two files per app with no compiler assistance (this string wire is untyped by design), and would
 * buy a distinction the UI does not have.
 *
 * [outcome] is one of `done` | `otp` | `failed`;
 * [errorKind] (on `failed`) is one of `invalidCredentials` | `codeIncorrect` | `codeExpired` |
 * `rateLimited` | `network` | `unexpected`. Kept primitive so Swift constructs it trivially.
 */
data class BridgeAuthResult(
    val outcome: String,
    val destination: String? = null,
    val errorKind: String? = null,
)

/**
 * The Swift-implemented bridge. Plain callbacks — no `suspend`, no `Flow`, no Kotlin sealed
 * types on the wire — so a Swift `NSObject` can conform to it and call Amplify Swift. It has only the
 * email-OTP flow and a local sign-out, mirroring [AuthDriver]'s absences.
 */
interface IosAuthBridge {
    fun fetchSession(forceRefresh: Boolean, onResult: (BridgeSession?) -> Unit)
    /** Whether this device holds a sign-in — `isSignedIn` from stored credentials, no network needed. */
    fun holdsSignIn(onResult: (Boolean) -> Unit)
    fun signInWithEmailOtp(email: String, onResult: (BridgeAuthResult) -> Unit)
    fun confirmOtp(code: String, onResult: (BridgeAuthResult) -> Unit)
    fun signOut(onResult: () -> Unit)
}
