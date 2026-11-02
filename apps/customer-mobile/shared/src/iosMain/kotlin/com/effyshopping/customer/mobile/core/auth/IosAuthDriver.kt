package com.effyshopping.customer.mobile.core.auth

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * The iOS side of the auth boundary. Kotlin/Native cannot call Amplify Swift, so Swift
 * implements the simple, callback-based [IosAuthBridge] (no `suspend`, no `Flow` - neither of which a
 * Swift class can produce), and this Kotlin class adapts it to the common [AuthDriver] contract: it
 * converts each callback into a coroutine, maps the bridge's flat result to [AuthStep], and owns the
 * [sessionChanges] Flow itself. Swift builds [IosAuthDriver] and hands it to `MainViewController`.
 *
 * The interface's deliberate absences (no password write, no global sign-out, no escape hatch) carry
 * over unchanged - the Swift bridge has no such methods either.
 */
class IosAuthDriver(private val bridge: IosAuthBridge) : AuthDriver {

    // iOS has no Android-Keystore failure mode and no Hub subscription here; a session found to be dead
    // while reading a token is what emits. Without it the app would go on looking signed in.
    private val _sessionChanges = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    override val sessionChanges: Flow<Unit> = _sessionChanges.asSharedFlow()

    override suspend fun currentSession(forceRefresh: Boolean): Session? {
        val result = suspendCancellableCoroutine<BridgeSessionResult> { cont ->
            bridge.fetchSession(forceRefresh) { cont.resumeIfActive(it) }
        }
        val session = result.session
        return when {
            result.outcome == "session" && session != null ->
                Session(session.sub, session.idToken, session.accessToken)
            result.outcome == "signedOut" -> null
            result.outcome == "ended" -> {
                _sessionChanges.tryEmit(Unit)
                null
            }
            // `unavailable`, and anything this build does not know: never a verdict on the session.
            else -> throw AppException(AppError.Network)
        }
    }

    override suspend fun signUpWithPassword(email: String, password: String): AuthStep =
        mapResult(await { cb -> bridge.signUpWithPassword(email, password, cb) })

    override suspend fun signUpPasswordless(email: String): AuthStep =
        mapResult(await { cb -> bridge.signUpPasswordless(email, cb) })

    override suspend fun confirmSignUp(email: String, code: String): AuthStep =
        mapResult(await { cb -> bridge.confirmSignUp(email, code, cb) })

    override suspend fun signInWithPassword(email: String, password: String): AuthStep =
        mapResult(await { cb -> bridge.signInWithPassword(email, password, cb) })

    override suspend fun signInWithEmailOtp(email: String): AuthStep =
        mapResult(await { cb -> bridge.signInWithEmailOtp(email, cb) })

    override suspend fun confirmOtp(code: String): AuthStep =
        mapResult(await { cb -> bridge.confirmOtp(code, cb) })

    override suspend fun resendSignUpCode(email: String): AuthStep =
        mapResult(await { cb -> bridge.resendSignUpCode(email, cb) })

    /** Not a resend - a fresh sign-in. See `AuthDriver.resendSignInCode`. */
    override suspend fun resendSignInCode(email: String): AuthStep = signInWithEmailOtp(email)

    override suspend fun startPasswordReset(email: String): AuthStep =
        mapResult(await { cb -> bridge.startPasswordReset(email, cb) })

    override suspend fun signOut() {
        suspendCancellableCoroutine<Unit> { cont -> bridge.signOut { cont.resumeIfActive(Unit) } }
    }

    // helpers

    private suspend fun await(register: ((BridgeAuthResult) -> Unit) -> Unit): BridgeAuthResult =
        suspendCancellableCoroutine { cont -> register { cont.resumeIfActive(it) } }

    private suspend fun mapResult(r: BridgeAuthResult): AuthStep = when (r.outcome) {
        "done" -> try {
            currentSession()?.let { AuthStep.Done(it) } ?: AuthStep.Failed(AuthError.Unexpected)
        } catch (e: AppException) {
            AuthStep.Failed(AuthError.Network)
        }
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

/** A signed-in session, flattened for the Swift bridge (no expiry - Amplify owns refresh). */
data class BridgeSession(val sub: String, val idToken: String, val accessToken: String)

/**
 * What reading the session found. [outcome] is one of `session` (with [session]) | `signedOut` | `ended`
 * (Cognito refused the session and the bridge has cleared it) | `unavailable` (no token right now; the
 * session is kept). Primitive for the same reason as [BridgeAuthResult].
 */
data class BridgeSessionResult(val outcome: String, val session: BridgeSession? = null)

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
 * The Swift-implemented bridge. Plain callbacks - no `suspend`, no `Flow`, no Kotlin sealed
 * types on the wire - so a Swift `NSObject` can conform to it and call Amplify Swift's async APIs,
 * invoking the callback when done. It has NO password-write / global-sign-out / escape-hatch method,
 * mirroring [AuthDriver]'s absences.
 */
interface IosAuthBridge {
    fun fetchSession(forceRefresh: Boolean, onResult: (BridgeSessionResult) -> Unit)
    fun signUpWithPassword(email: String, password: String, onResult: (BridgeAuthResult) -> Unit)
    fun signUpPasswordless(email: String, onResult: (BridgeAuthResult) -> Unit)
    fun confirmSignUp(email: String, code: String, onResult: (BridgeAuthResult) -> Unit)
    fun signInWithPassword(email: String, password: String, onResult: (BridgeAuthResult) -> Unit)
    fun signInWithEmailOtp(email: String, onResult: (BridgeAuthResult) -> Unit)
    fun confirmOtp(code: String, onResult: (BridgeAuthResult) -> Unit)
    fun resendSignUpCode(email: String, onResult: (BridgeAuthResult) -> Unit)
    fun startPasswordReset(email: String, onResult: (BridgeAuthResult) -> Unit)
    fun signOut(onResult: () -> Unit)
}
