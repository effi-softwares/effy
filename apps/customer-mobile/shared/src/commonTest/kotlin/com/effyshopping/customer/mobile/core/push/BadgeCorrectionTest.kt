package com.effyshopping.customer.mobile.core.push

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** 116 C6: what a silent correction takes off the screen. */
class BadgeCorrectionTest {

    @Test
    fun readsACorrectionAndIgnoresAnythingElse() {
        assertEquals(BadgeCorrection(2, setOf("a", "b")), BadgeCorrection.of(mapOf("type" to "badge", "count" to "2", "keep" to "a,b")))
        assertEquals(BadgeCorrection(0, emptySet()), BadgeCorrection.of(mapOf("type" to "badge", "count" to "0", "keep" to "")))
        assertNull(BadgeCorrection.of(mapOf("type" to "order_paid", "count" to "2")))
        assertNull(BadgeCorrection.of(mapOf("type" to "badge", "count" to "-1")))
        assertNull(BadgeCorrection.of(mapOf("type" to "badge")))
    }

    @Test
    fun takesAwayWhatIsNoLongerUnseen() {
        val shown = listOf("a", "b", "c", null)
        assertEquals(listOf("c", null), badgeCancellations(shown, BadgeCorrection(2, setOf("a", "b"))))
        assertEquals(shown, badgeCancellations(shown, BadgeCorrection(0, setOf("a"))))
        assertEquals(emptyList(), badgeCancellations(emptyList(), BadgeCorrection(3, setOf("a"))))
    }
}
