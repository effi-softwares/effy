package com.effyshopping.customer.mobile.core.auth

import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * The iOS side of the auth boundary (013 D5). Kotlin/Native cannot call Amplify Swift, so Swift
 * implements the simple, callback-based [IosAuthBridge] (no `suspend`, no `Flow` — neither of which a
 * Swift class can produce), and THIS Kotlin class adapts it to the common [AuthDriver] contract: it
 * converts each callback into a coroutine, maps the bridge's flat result to [AuthStep], and owns the
 * [sessionChanges] Flow itself. Swift builds [IosAuthDriver] and hands it to `MainViewController`.
 *
 * The interface's deliberate absences (no password write, no global sign-out, no escape hatch) carry
 * over unchanged — the Swift bridge has no such methods either.
 */
class IosAuthDriver(private val bridge: IosAuthBridge) : AuthDriver {

    // iOS has no Android-Keystore failure mode, so nothing emits here — the Flow just stays idle.
    private val _sessionChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    override val sessionChanges: Flow<Unit> = _sessionChanges.asSharedFlow()

    override suspend fun currentSession(forceRefresh: Boolean): Session? =
        suspendCancellableCoroutine { cont ->
            bridge.fetchSession(forceRefresh) { s ->
                cont.resumeIfActive(s?.let { Session(it.sub, it.idToken, it.accessToken, 0L) })
            }
        }

    override suspend fun signUpWithPassword(email: String, password: String, given: String, family: String): AuthStep =
        mapResult(await { cb -> bridge.signUpWithPassword(email, password, given, family, cb) })

    override suspend fun signUpPasswordless(email: String, given: String, family: String): AuthStep =
        mapResult(await { cb -> bridge.signUpPasswordless(email, given, family, cb) })

    override suspend fun confirmSignUp(email: String, code: String): AuthStep =
        mapResult(await { cb -> bridge.confirmSignUp(email, code, cb) })

    override suspend fun signInWithPassword(email: String, password: String): AuthStep =
        mapResult(await { cb -> bridge.signInWithPassword(email, password, cb) })

    override suspend fun signInWithEmailOtp(email: String): AuthStep =
        mapResult(await { cb -> bridge.signInWithEmailOtp(email, cb) })

    override suspend fun confirmOtp(code: String): AuthStep =
        mapResult(await { cb -> bridge.confirmOtp(code, cb) })

    override suspend fun startPasswordReset(email: String): AuthStep =
        mapResult(await { cb -> bridge.startPasswordReset(email, cb) })

    override suspend fun signOut() {
        suspendCancellableCoroutine<Unit> { cont -> bridge.signOut { cont.resumeIfActive(Unit) } }
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    private suspend fun await(register: ((BridgeAuthResult) -> Unit) -> Unit): BridgeAuthResult =
        suspendCancellableCoroutine { cont -> register { cont.resumeIfActive(it) } }

    private suspend fun mapResult(r: BridgeAuthResult): AuthStep = when (r.outcome) {
        "done" -> currentSession()?.let { AuthStep.Done(it) } ?: AuthStep.Failed(AuthError.Unexpected)
        "otp" -> AuthStep.NeedsOtp(r.destination ?: "your email")
        "signupConfirm" -> AuthStep.NeedsSignUpConfirmation(r.email ?: "")
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
data class BridgeSession(val sub: String, val idToken: String, val accessToken: String)

/**
 * A flat auth result the Swift bridge returns. [outcome] is one of `done` | `otp` | `signupConfirm` |
 * `failed`; [errorKind] (on `failed`) is one of `invalidCredentials` | `codeIncorrect` | `codeExpired`
 * | `rateLimited` | `network` | `unexpected`. Kept primitive so Swift constructs it trivially.
 */
data class BridgeAuthResult(
    val outcome: String,
    val destination: String? = null,
    val email: String? = null,
    val errorKind: String? = null,
)

/**
 * The Swift-implemented bridge (013 D5). Plain callbacks — no `suspend`, no `Flow`, no Kotlin sealed
 * types on the wire — so a Swift `NSObject` can conform to it and call Amplify Swift's async APIs,
 * invoking the callback when done. It has NO password-write / global-sign-out / escape-hatch method,
 * mirroring [AuthDriver]'s absences (FR-024).
 */
interface IosAuthBridge {
    fun fetchSession(forceRefresh: Boolean, onResult: (BridgeSession?) -> Unit)
    fun signUpWithPassword(email: String, password: String, given: String, family: String, onResult: (BridgeAuthResult) -> Unit)
    fun signUpPasswordless(email: String, given: String, family: String, onResult: (BridgeAuthResult) -> Unit)
    fun confirmSignUp(email: String, code: String, onResult: (BridgeAuthResult) -> Unit)
    fun signInWithPassword(email: String, password: String, onResult: (BridgeAuthResult) -> Unit)
    fun signInWithEmailOtp(email: String, onResult: (BridgeAuthResult) -> Unit)
    fun confirmOtp(code: String, onResult: (BridgeAuthResult) -> Unit)
    fun startPasswordReset(email: String, onResult: (BridgeAuthResult) -> Unit)
    fun signOut(onResult: () -> Unit)
}
