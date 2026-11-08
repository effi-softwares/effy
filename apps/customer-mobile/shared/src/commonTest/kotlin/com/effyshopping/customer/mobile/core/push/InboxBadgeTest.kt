package com.effyshopping.customer.mobile.core.push

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlin.test.Test
import kotlin.test.assertEquals

/** The bell's number (110 R7): read on sign-in and on the live word, 0 when signed out, the last number on a failure. */
@OptIn(ExperimentalCoroutinesApi::class)
class InboxBadgeTest {
    private val scope = TestScope(UnconfinedTestDispatcher())

    @Test
    fun reads_on_sign_in_and_on_each_live_update_and_drops_to_zero_on_sign_out() {
        var server = 3
        var fail = false
        val live = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val signedIn = MutableStateFlow(false)
        val badge = InboxBadge(read = { if (fail) error("offline") else server }, changes = live, signedIn = signedIn, scope = scope)

        assertEquals(0, badge.count.value)
        signedIn.value = true
        assertEquals(3, badge.count.value)

        server = 4
        live.tryEmit(Unit)
        assertEquals(4, badge.count.value)

        fail = true
        live.tryEmit(Unit)
        assertEquals(4, badge.count.value)

        badge.set(0)
        assertEquals(0, badge.count.value)

        signedIn.value = false
        badge.set(7)
        assertEquals(0, badge.count.value)
    }
}
