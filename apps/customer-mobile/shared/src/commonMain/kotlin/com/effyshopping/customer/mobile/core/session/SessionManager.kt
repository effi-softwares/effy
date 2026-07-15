package com.effyshopping.customer.mobile.core.session

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Owns [SessionState] (013 data-model § 4). The single source of truth for "who is using the app".
 *
 * It reads the session from the [authDriver] (Amplify owns the tokens) and the record from
 * [customers] — because identity is displayed from the RECORD, never the token (FR-032), and the
 * record decides access (FR-033). It also listens for SDK-initiated session drops (Android Keystore
 * failure, D11): "signed out unexpectedly" is a real transition, not a swallowed error.
 */
class SessionManager(
    private val authDriver: AuthDriver,
    private val customers: CustomerRepository,
    scope: CoroutineScope,
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
    }

    private suspend fun loadRecord(seedPassword: Boolean) {
        try {
            setAuthenticated(customers.me(seedPassword))
        } catch (e: AppException) {
            when (e.error) {
                // Barred mid-session (FR-033a): refuse, destroy the local session, and say why via Barred.
                AppError.Forbidden -> {
                    runCatching { authDriver.signOut() }
                    _state.value = SessionState.Barred
                }
                AppError.Unauthenticated -> signOutLocally()
                // Network/other on bootstrap: we hold a valid credential but can't confirm the record.
                // Fall back to Guest rather than hang in Restoring; the session survives for a retry.
                else -> _state.value = SessionState.Guest
            }
        }
    }
}
