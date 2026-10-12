package com.effyshopping.driver.mobile.features.today.data

import com.effyshopping.driver.mobile.features.today.domain.ShiftClock
import com.russhwolf.settings.Settings

/** [ShiftClock] in the phone's preferences, so a shift is still timed if the app is closed during it. */
class SettingsShiftClock(private val settings: Settings) : ShiftClock {
    override fun started(atEpochMillis: Long) = settings.putLong(START, atEpochMillis)

    override fun ended(atEpochMillis: Long) {
        val start = settings.getLongOrNull(START)
        settings.remove(START)
        // A shift with no known start has no length — and must not leave the previous one's showing.
        if (start != null && atEpochMillis >= start) settings.putLong(LAST, atEpochMillis - start) else settings.remove(LAST)
    }

    override fun lastShiftMillis(): Long? = settings.getLongOrNull(LAST)

    private companion object {
        const val START = "driver.shift.started.v1"
        const val LAST = "driver.shift.last.v1"
    }
}
