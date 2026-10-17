package com.effyshopping.driver.mobile.core.presentation

import com.effyshopping.driver.mobile.core.platform.localTimeText
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

/**
 * How this app says WHEN something happened.
 *
 * ⚠ Every record used to print its timestamp as the wire sent it — `2026-10-12 03:35:07`, in UTC,
 * which in Melbourne is the wrong hour and sometimes the wrong day.
 */

@OptIn(ExperimentalTime::class)
fun nowEpochMillis(): Long = Clock.System.now().toEpochMilliseconds()

@OptIn(ExperimentalTime::class)
internal fun isoToMillis(iso: String): Long? = runCatching { Instant.parse(iso).toEpochMilliseconds() }.getOrNull()

/** "Mon 12 Oct, 2:35 pm" for an ISO instant. An unreadable value is shown as it came, never dropped. */
fun whenText(iso: String): String = isoToMillis(iso)?.let { localTimeText(it, withDay = true) } ?: iso

/** "2:35 pm" for an ISO instant. */
fun timeText(iso: String): String = isoToMillis(iso)?.let { localTimeText(it, withDay = false) } ?: iso

private val DAYS = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
private val MONTH_OFFSETS = intArrayOf(0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)

/**
 * "Mon 12 Oct" for a calendar day written `2026-10-12`. A day has no time zone, so this is plain
 * arithmetic (Sakamoto's weekday rule) and needs nothing from the platform.
 */
fun dayText(isoDate: String): String {
    val parts = isoDate.split('-').mapNotNull { it.toIntOrNull() }
    if (parts.size != 3 || parts[1] !in 1..12 || parts[2] !in 1..31) return isoDate
    val (year, month, day) = parts
    val y = if (month < 3) year - 1 else year
    val weekday = (y + y / 4 - y / 100 + y / 400 + MONTH_OFFSETS[month - 1] + day) % 7
    return "${DAYS[weekday]} $day ${MONTHS[month - 1]}"
}

/** "6 h 12 min", or "45 min" under an hour. */
fun durationText(millis: Long): String {
    val minutes = (millis / 60_000).coerceAtLeast(0)
    val hours = minutes / 60
    return if (hours > 0) "$hours h ${minutes % 60} min" else "$minutes min"
}
