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
import kotlinx.coroutines.sync.Mutex

/**
 * Owns [SessionState], the one answer to "who is using the app". The session comes from [authDriver]
 * (Amplify owns the tokens) and the record from [getCustomer]: identity is shown from the record, which
 * decides access. An SDK-initiated session drop (Keystore failure, an expired or revoked session) is a
 * real transition, not a swallowed error.
 *
 * ⚠ ONLY THE PLATFORM ENDS A SESSION. Guest means the driver said there is no session, or a 401 survived
 * a forced token refresh; Barred means a 403. Every other failure to read the record is [SessionState.Unreachable]:
 * an outage or a bad connection must never look like being signed out.
 */
class SessionManager(
    private val authDriver: AuthDriver,
    private val getCustomer: GetCustomer,
    scope: CoroutineScope,
    /**
     * Fired once per Guest/Restoring → Authenticated transition. The cart uses it to merge the
     * device's lines into the account cart - which is what makes a cart built on one phone appear on
     * another. Deliberately a lambda rather than a cart dependency: the session manager has no business
     * knowing what a cart is, and a later feature can hang its own sign-in work here the same way.
     *
     * It is not fired on `refreshRecord` (a name change, say). The merge is idempotent so a spurious
     * call would be harmless, but it would cost a request on every profile edit for nothing.
     */
    private val onAuthenticated: suspend () -> Unit = {},
    /** Fired on local sign-out. The cart uses it to drop the account's mirror from this device. */
    private val onSignedOut: () -> Unit = {},
) : SessionWriter {
    private val _state = MutableStateFlow<SessionState>(SessionState.Restoring)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    /** Coming back to the app and tapping Try again can land together; one read of the record is enough. */
    private val retrying = Mutex()

    init {
        scope.launch {
            authDriver.sessionChanges.collect { bootstrap() }
        }
    }

    /** On launch (and on an unexpected drop): decide Restoring → Guest / Authenticated / Barred. */
    suspend fun bootstrap() {
        val wasSignedIn = _state.value is SessionState.Authenticated
        _state.value = SessionState.Restoring
        // A driver that cannot tell (it throws) has not said "signed out", so the record read goes ahead
        // and its own retries decide. Only a null is an answer.
        val signedOut = try {
            authDriver.currentSession() == null
        } catch (e: AppException) {
            false
        }
        if (signedOut) {
            _state.value = SessionState.Guest
            // The session ended underneath a signed-in shopper: the device forgets the account as it
            // does on a sign-out they asked for.
            if (wasSignedIn) runCatching { onSignedOut() }
        } else {
            loadRecord(seedPassword = false)
        }
    }

    /** Read the record again after [SessionState.Unreachable]. Does nothing from any other state. */
    suspend fun retry() {
        if (_state.value != SessionState.Unreachable || !retrying.tryLock()) return
        try {
            loadRecord(seedPassword = false)
        } finally {
            retrying.unlock()
        }
    }

    /** After a successful sign-in / registration. [seedPassword] seeds has_password on first appearance. */
    suspend fun onSignedIn(seedPassword: Boolean = false) = loadRecord(seedPassword)

    /** Refresh the record after a name change etc., without a full re-bootstrap. */
    suspend fun refreshRecord() {
        val current = _state.value
        if (current is SessionState.Authenticated) loadRecord(seedPassword = false)
    }

    override fun setAuthenticated(customer: Customer) {
        _state.value = if (customer.isBarred) SessionState.Barred else SessionState.Authenticated(customer)
    }

    /** A control refused with 403 mid-session - the record now bars this customer. */
    /**
     * The record says this account is being deleted.
     *
     * Set from the same 403 that raises [setBarred] - the backend deliberately does not disclose
     * which condition applied, so the client cannot tell them apart from the refusal alone. It is set
     * when the closure preview confirms a live request, which is the one place the truth is available.
     */
    fun setClosing() {
        _state.value = SessionState.Closing
    }

    override fun setBarred() {
        _state.value = SessionState.Barred
    }

    /** Local sign-out (this device). Purges the driver's tokens and returns to Guest. */
    suspend fun signOutLocally() {
        runCatching { authDriver.signOut() }
        _state.value = SessionState.Guest
        // The account's cart must not stay on the device. The account cart itself is untouched.
        runCatching { onSignedOut() }
    }

    private suspend fun loadRecord(seedPassword: Boolean) {
        var attempt = 0
        var tokensRenewed = false
        while (true) {
            try {
                val wasAuthenticated = _state.value is SessionState.Authenticated
                setAuthenticated(getCustomer(seedPassword))
                // A genuine sign-in (not a record refresh) - hand off to whoever needs to react. The
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
                    // Barred mid-session: refuse, destroy the local session, say why via Barred.
                    error == AppError.Forbidden -> {
                        runCatching { authDriver.signOut() }
                        _state.value = SessionState.Barred
                        return
                    }
                    // One refusal is not the end of a session: the token may simply be stale. Renew it
                    // once and ask again; a refusal of a token Cognito just issued is real.
                    error == AppError.Unauthenticated -> {
                        if (!tokensRenewed) {
                            tokensRenewed = true
                            val renewed = try {
                                authDriver.currentSession(forceRefresh = true)
                            } catch (e: AppException) {
                                settleUnreachable()
                                return
                            }
                            if (renewed != null) continue
                        }
                        signOutLocally()
                        return
                    }
                    // A transient failure on a valid credential: retry a couple of times before giving
                    // up, so a launch-time 5xx/429/blip clears without the shopper seeing anything.
                    error == AppError.Network || error == AppError.Unavailable || error is AppError.RateLimited -> {
                        if (attempt++ < MAX_BOOTSTRAP_RETRIES) {
                            delay(RETRY_BASE_MILLIS * attempt)
                            continue
                        }
                        settleUnreachable()
                        return
                    }
                    else -> {
                        settleUnreachable()
                        return
                    }
                }
            }
        }
    }

    /**
     * The record could not be read and the session has not been refused. A shopper already in the app
     * stays there on the record they have: a failed re-read takes nothing away from them.
     */
    private fun settleUnreachable() {
        if (_state.value !is SessionState.Authenticated) _state.value = SessionState.Unreachable
    }

    private companion object {
        const val MAX_BOOTSTRAP_RETRIES = 2
        const val RETRY_BASE_MILLIS = 700L
    }
}
