package com.effyshopping.customer.mobile.core.session

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.GetCustomer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Owns [SessionState] (013 data-model § 4). The single source of truth for "who is using the app".
 *
 * It reads the session from the [authDriver] (Amplify owns the tokens) and the record via
 * [getCustomer] — because identity is displayed from the RECORD, never the token (FR-032), and the
 * record decides access (FR-033). It also listens for SDK-initiated session drops (Android Keystore
 * failure, D11): "signed out unexpectedly" is a real transition, not a swallowed error.
 */
class SessionManager(
    private val authDriver: AuthDriver,
    private val getCustomer: GetCustomer,
    scope: CoroutineScope,
    /**
     * Fired once per Guest/Restoring → Authenticated transition (027). The cart uses it to merge the
     * device's lines into the account cart — which is what makes a cart built on one phone appear on
     * another. Deliberately a lambda rather than a cart dependency: the session manager has no business
     * knowing what a cart is, and a later feature can hang its own sign-in work here the same way.
     *
     * ⚠ It is NOT fired on `refreshRecord()` (a name change, say). The merge is idempotent so a spurious
     * call would be harmless, but it would cost a request on every profile edit for nothing.
     */
    private val onAuthenticated: suspend () -> Unit = {},
    /** Fired on local sign-out. The cart uses it to drop the account's mirror from this device. */
    private val onSignedOut: () -> Unit = {},
) {
    private val _state = MutableStateFlow<SessionState>(SessionState.Restoring)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    init {
        scope.launch {
            authDriver.sessionChanges.collect { bootstrap() }
        }
    }

    /** On launch (and on an unexpected drop): decide Restoring → Guest / Authenticated / Barred. */
    suspend fun bootstrap() {
        _state.value = SessionState.Restoring
        val session = runCatching { authDriver.currentSession() }.getOrNull()
        if (session == null) {
            _state.value = SessionState.Guest
        } else {
            loadRecord(seedPassword = false)
        }
    }

    /** After a successful sign-in / registration. [seedPassword] seeds has_password on first appearance. */
    suspend fun onSignedIn(seedPassword: Boolean = false) = loadRecord(seedPassword)

    /** Refresh the record after a name change etc., without a full re-bootstrap. */
    suspend fun refreshRecord() {
        val current = _state.value
        if (current is SessionState.Authenticated) loadRecord(seedPassword = false)
    }

    fun setAuthenticated(customer: Customer) {
        _state.value = if (customer.isBarred) SessionState.Barred else SessionState.Authenticated(customer)
    }

    /** A control refused with 403 mid-session (FR-033a) — the record now bars this customer. */
    fun setBarred() {
        _state.value = SessionState.Barred
    }

    /** Local sign-out (this device). Purges the driver's tokens and returns to Guest (FR-021/FR-030). */
    suspend fun signOutLocally() {
        runCatching { authDriver.signOut() }
        _state.value = SessionState.Guest
        // 027: the account's cart must not stay on the device. The account cart itself is untouched.
        runCatching { onSignedOut() }
    }

    private suspend fun loadRecord(seedPassword: Boolean) {
        var attempt = 0
        while (true) {
            try {
                val wasAuthenticated = _state.value is SessionState.Authenticated
                setAuthenticated(getCustomer(seedPassword))
                // 027: a genuine SIGN-IN (not a record refresh) — hand off to whoever needs to react. The
                // cart merges the device's lines into the account cart here. A failure must not undo the
                // sign-in: the shopper is authenticated either way, and the merge retries on the next
                // cart open.
                if (!wasAuthenticated && _state.value is SessionState.Authenticated) {
                    runCatching { onAuthenticated() }
                }
                return
            } catch (e: AppException) {
                val error = e.error
                when {
                    // Barred mid-session (FR-033a): refuse, destroy the local session, say why via Barred.
                    error == AppError.Forbidden -> {
                        runCatching { authDriver.signOut() }
                        _state.value = SessionState.Barred
                        return
                    }
                    error == AppError.Unauthenticated -> {
                        signOutLocally()
                        return
                    }
                    // A TRANSIENT failure on a valid credential: retry a couple of times before giving
                    // up, so a launch-time 5xx/429/blip doesn't masquerade as a sign-out.
                    error == AppError.Network || error == AppError.Unavailable || error is AppError.RateLimited -> {
                        if (attempt++ < MAX_BOOTSTRAP_RETRIES) {
                            delay(RETRY_BASE_MILLIS * attempt)
                            continue
                        }
                        // Exhausted retries — fall back to Guest; the Amplify session survives for a relaunch.
                        _state.value = SessionState.Guest
                        return
                    }
                    else -> {
                        _state.value = SessionState.Guest
                        return
                    }
                }
            }
        }
    }

    private companion object {
        const val MAX_BOOTSTRAP_RETRIES = 2
        const val RETRY_BASE_MILLIS = 700L
    }
}
