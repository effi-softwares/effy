package com.effyshopping.driver.mobile.core.scan

import kotlin.test.Test
import kotlin.test.assertEquals

/** A label held in view is reported once per two seconds. */
class ReadDebouncerTest {
    @Test fun the_same_code_within_two_seconds_is_dropped_another_code_is_not() {
        val d = ReadDebouncer(windowMillis = 2_000)
        assertEquals(true, d.accept("AAAAAA", 0))
        assertEquals(false, d.accept("AAAAAA", 1_999))
        assertEquals(true, d.accept("BBBBBB", 1_999))
        assertEquals(true, d.accept("AAAAAA", 2_000))
    }
}
