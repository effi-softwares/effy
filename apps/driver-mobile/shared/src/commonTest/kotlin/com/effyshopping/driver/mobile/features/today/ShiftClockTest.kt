package com.effyshopping.driver.mobile.features.today

import com.effyshopping.driver.mobile.features.today.data.SettingsShiftClock
import com.russhwolf.settings.MapSettings
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ShiftClockTest {
    @Test fun a_shift_is_timed_from_going_on_duty_to_going_off() {
        val settings = MapSettings()
        SettingsShiftClock(settings).started(1_000)
        // The app was closed in between: the start must still be known.
        val clock = SettingsShiftClock(settings)
        clock.ended(61_000)
        assertEquals(60_000, clock.lastShiftMillis())
    }

    /** Went on duty on another phone: there is no length, and the previous shift's must not show. */
    @Test fun a_shift_with_no_known_start_has_no_length() {
        val clock = SettingsShiftClock(MapSettings())
        clock.started(1_000); clock.ended(2_000)
        clock.ended(9_000)
        assertNull(clock.lastShiftMillis())
    }
}
