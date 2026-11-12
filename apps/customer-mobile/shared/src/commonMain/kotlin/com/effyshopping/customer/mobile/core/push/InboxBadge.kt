package com.effyshopping.customer.mobile.core.push

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * The bell's number (110 R7): how many of the shopper's notifications they have not seen.
 *
 * Read when someone signs in, whenever the platform says their inbox changed (the live kind `inbox`, which also
 * fires when the channel reconnects - i.e. when the app comes back to the front), and after any inbox action. Never on
 * a timer. Signed out, it is 0. A failed read keeps the last number: a wrong 0 would hide a real notification.
 */
class InboxBadge(
    private val read: suspend () -> Int,
    changes: Flow<Unit>,
    signedIn: Flow<Boolean>,
    private val scope: CoroutineScope,
) {
    private val _count = MutableStateFlow(0)
    val count: StateFlow<Int> = _count.asStateFlow()
    private val _known = MutableStateFlow(false)
    /** 116: true once the count was read for the signed-in shopper - the icon is set only from a number we know. */
    val known: StateFlow<Boolean> = _known.asStateFlow()
    private var active = false

    init {
        scope.launch {
            signedIn.distinctUntilChanged().collect { yes ->
                active = yes
                if (yes) refresh() else {
                    _count.value = 0
                    _known.value = false
                }
            }
        }
        scope.launch { changes.collect { if (active) refresh() } }
    }

    fun refresh() {
        scope.launch {
            try {
                _count.value = read()
                _known.value = true
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                // Keep the last number.
            }
        }
    }

    /** What an inbox action already answered (seen → 0), so the bell changes at once. */
    fun set(count: Int) {
        if (active) _count.value = count.coerceAtLeast(0)
    }
}
