package com.effyshopping.driver.mobile.core.presentation

import kotlin.test.Test
import kotlin.test.assertEquals

class TimeWordsTest {
    @Test fun a_day_is_said_with_its_weekday() {
        assertEquals("Mon 12 Oct", dayText("2026-10-12"))
        assertEquals("Thu 1 Jan", dayText("2026-01-01"))
        assertEquals("Thu 29 Feb", dayText("2024-02-29"))
    }

    @Test fun an_unreadable_day_is_shown_as_it_came() {
        assertEquals("yesterday", dayText("yesterday"))
        assertEquals("2026-13-01", dayText("2026-13-01"))
    }

    @Test fun a_duration_drops_the_hours_when_there_are_none() {
        assertEquals("45 min", durationText(45 * 60_000L))
        assertEquals("6 h 12 min", durationText((6 * 60 + 12) * 60_000L))
        assertEquals("0 min", durationText(-5))
    }

    @Test fun an_unreadable_instant_is_shown_as_it_came() {
        assertEquals("soon", whenText("soon"))
    }
}
