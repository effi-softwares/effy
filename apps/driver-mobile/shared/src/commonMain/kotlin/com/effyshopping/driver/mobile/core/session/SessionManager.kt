package com.effyshopping.driver.mobile.core.session

import com.effyshopping.driver.mobile.core.auth.AuthDriver
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.features.driver.domain.GetDriverIdentity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Owns [SessionState] (014). Reads the session from [authDriver] (Amplify owns tokens) and the record
 * via [getDriverIdentity] — identity is displayed from the RECORD, never the token (FR-019). Listens for SDK
 * session drops (Android Keystore failure — 013 D11).
 */
class SessionManager(
    private val authDriver: AuthDriver,
    private val getDriverIdentity: GetDriverIdentity,
    private val scope: CoroutineScope,
    /** Clears what the app keeps on the phone for the signed-in driver (last copies). */
    private val onSignedOut: () -> Unit = {},
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
        // ⚠ NO SESSION AND "COULD NOT CHECK" ARE DIFFERENT ANSWERS (backlog C3). With no signal the
        // tokens cannot be refreshed, so `currentSession` is null — yet this device is still signed
        // in. Only a device holding no sign-in goes to the sign-in screen.
        val signedIn = session != null || runCatching { authDriver.holdsSignIn() }.getOrDefault(false)
        if (signedIn) loadRecord() else _state.value = SessionState.SignedOut
    }

    /**
     * The connection is back: if the app opened offline, check the session and record for real now.
     * Quietly — the driver stays on what they are looking at unless the answer says otherwise.
     */
    fun recheckIfOffline() {
        val now = _state.value
        if (now !is SessionState.SignedIn || !now.offline) return
        if (!rechecking.compareAndSet(expect = false, update = true)) return
        scope.launch {
            try {
                loadRecord()
            } finally {
                rechecking.value = false
            }
        }
    }

    private val rechecking = MutableStateFlow(false)

    /**
     * A request was answered 401 or 403 while signed in (backlog C4). Re-run [bootstrap] once — however
     * many requests were refused together — which ends in SignedOut or Refused, or back in SignedIn if
     * the credential was only stale. Ignored before sign-in, where [loadRecord] handles those answers.
     */
    fun onRequestRejected() {
        if (_state.value !is SessionState.SignedIn) return
        if (!rechecking.compareAndSet(expect = false, update = true)) return
        scope.launch {
            try {
                bootstrap()
            } finally {
                rechecking.value = false
            }
        }
    }

    /** After a successful email → code sign-in. */
    suspend fun onSignedIn() = loadRecord()

    /** Local sign-out (this device). Purges tokens and returns to the sign-in flow (FR-018). */
    suspend fun signOutLocally() {
        runCatching { authDriver.signOut() }
        runCatching { onSignedOut() }
        _state.value = SessionState.SignedOut
    }

    private suspend fun loadRecord() {
        var attempt = 0
        while (true) {
            try {
                _state.value = SessionState.SignedIn(getDriverIdentity())
                return
            } catch (e: AppException) {
                val error = e.error
                when {
                    // A disabled/unprovisioned driver (403 on the record) → Refused, destroy the session.
                    error == AppError.Forbidden -> {
                        runCatching { authDriver.signOut() }
                        runCatching { onSignedOut() }
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
                        // ⚠ "Could not check" is not "signed out" (backlog C3): open on the record
                        // kept on the phone. Only with none kept is there nothing to open on.
                        val kept = (_state.value as? SessionState.SignedIn)?.driver ?: getDriverIdentity.lastKnown()
                        _state.value = if (kept != null) SessionState.SignedIn(kept, offline = true) else SessionState.SignedOut
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
