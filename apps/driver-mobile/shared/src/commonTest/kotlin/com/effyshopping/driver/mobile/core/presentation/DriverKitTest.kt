package com.effyshopping.driver.mobile.core.presentation

import kotlin.test.Test
import kotlin.test.assertEquals

class DriverKitTest {
    /** The canvas's eight words, spelled once (Foundations: "one word, one look"). */
    @Test fun the_status_words_are_the_canvas_words() {
        assertEquals(
            listOf("Next", "To collect", "Collected", "Delivered", "Due now", "Late", "Short", "Not delivered"),
            listOf(
                DriverStatus.Next, DriverStatus.ToCollect, DriverStatus.Collected, DriverStatus.Delivered,
                DriverStatus.DueNow, DriverStatus.Late, DriverStatus.Short, DriverStatus.NotDelivered,
            ).map { it.word },
        )
    }

    /** Offline first (it explains the rest), then waiting, then refused, then live paused. */
    @Test fun banners_stack_in_one_order() {
        assertEquals(
            listOf(DriverBanner.Offline, DriverBanner.Waiting, DriverBanner.Refused),
            driverBanners(offline = true, waiting = 2, refused = 1, livePaused = true),
        )
        assertEquals(
            listOf(DriverBanner.Waiting, DriverBanner.LivePaused),
            driverBanners(offline = false, waiting = 1, refused = 0, livePaused = true),
        )
        assertEquals(emptyList(), driverBanners(offline = false, waiting = 0, refused = 0, livePaused = false))
    }
}
