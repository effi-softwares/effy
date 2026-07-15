package com.effyshopping.shop.mobile.core.session

import com.effyshopping.shop.mobile.core.auth.AuthDriver
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.shop.domain.GetOperator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Owns [SessionState] (014). Reads the session from [authDriver] (Amplify owns tokens) and the record
 * via [getOperator] — identity is displayed from the RECORD, never the token (FR-019). Listens for SDK
 * session drops (Android Keystore failure — 013 D11).
 */
class SessionManager(
    private val authDriver: AuthDriver,
    private val getOperator: GetOperator,
    scope: CoroutineScope,
) {
    private val _state = MutableStateFlow<SessionState>(SessionState.Restoring)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    init {
        scope.launch { authDriver.sessionChanges.collect { bootstrap() } }
    }

    /** On launch (and on an unexpected drop): Restoring → SignedOut / SignedIn / Refused. */
    suspend fun bootstrap() {
        _state.value = SessionState.Restoring
        val session = runCatching { authDriver.currentSession() }.getOrNull()
        if (session == null) _state.value = SessionState.SignedOut else loadRecord()
    }

    /** After a successful email → code sign-in. */
    suspend fun onSignedIn() = loadRecord()

    /** Local sign-out (this device). Purges tokens and returns to the sign-in flow (FR-018). */
    suspend fun signOutLocally() {
        runCatching { authDriver.signOut() }
        _state.value = SessionState.SignedOut
    }

    private suspend fun loadRecord() {
        var attempt = 0
        while (true) {
            try {
                _state.value = SessionState.SignedIn(getOperator())
                return
            } catch (e: AppException) {
                val error = e.error
                when {
                    // A disabled operator / refused identity read (FR-030) → Refused, destroy the session.
                    error == AppError.Forbidden -> {
                        runCatching { authDriver.signOut() }
                        _state.value = SessionState.Refused
                        return
                    }
                    error == AppError.Unauthenticated -> {
                        signOutLocally()
                        return
                    }
                    // A transient failure on a valid credential: retry before giving up (013 review fix).
                    error == AppError.Network || error == AppError.Unavailable || error is AppError.RateLimited -> {
                        if (attempt++ < MAX_RETRIES) {
                            delay(RETRY_BASE_MILLIS * attempt)
                            continue
                        }
                        _state.value = SessionState.SignedOut
                        return
                    }
                    else -> {
                        _state.value = SessionState.SignedOut
                        return
                    }
                }
            }
        }
    }

    private companion object {
        const val MAX_RETRIES = 2
        const val RETRY_BASE_MILLIS = 700L
    }
}
