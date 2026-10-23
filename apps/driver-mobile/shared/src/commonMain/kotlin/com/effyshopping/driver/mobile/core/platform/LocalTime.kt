package com.effyshopping.driver.mobile.core.platform

/**
 * A moment in the phone's own time zone and words: "2:35 pm", or "Mon 12 Oct, 2:35 pm" with the day.
 *
 * `expect/actual` because the time-zone database lives in the platform, not in this module. For
 * records only — when something happened. A delivery window is still said in the server's words
 * (`DeliveryWindow.label`), never re-worded here.
 */
expect fun localTimeText(epochMillis: Long, withDay: Boolean): String

/** The phone's calendar day for a moment, as `2026-10-12` — the shape the history days arrive in. */
expect fun localDateIso(epochMillis: Long): String

/** The hour of the day (0–23) on the phone's clock — for "Morning" / "Afternoon" / "Evening". */
expect fun localHour(epochMillis: Long): Int
