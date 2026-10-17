package com.effyshopping.driver.mobile.core.scan

import kotlin.test.Test
import kotlin.test.assertEquals

/** Probe: the same `when` as CameraBanner, outside Compose, on Kotlin/Native. */
class ScanBannerWhenIosTest {
    private fun word(b: ScanBanner?): String = when (b) {
        is ScanBanner.Counted -> "counted"
        is ScanBanner.Already -> "already"
        is ScanBanner.WrongPlace -> "wrong"
        is ScanBanner.NotYours -> "notyours"
        ScanBanner.NotACode -> "notacode"
        null -> "idle"
    }

    @Test fun every_banner_has_a_branch() {
        assertEquals("idle", word(null))
        assertEquals("counted", word(ScanBanner.Counted(null, "5MQKVF")))
        assertEquals("already", word(ScanBanner.Already(null)))
        assertEquals("wrong", word(ScanBanner.WrongPlace("x", "y")))
        assertEquals("notyours", word(ScanBanner.NotYours("y")))
        assertEquals("notacode", word(ScanBanner.NotACode))
    }
}
