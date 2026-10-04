package com.effyshopping.customer.mobile.features.checkout.domain

import com.effyshopping.customer.mobile.core.platform.melbourneOffsetSeconds
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

/**
 * How this app says when an order arrives (069).
 *
 * ⚠ THE KOTLIN TWIN OF `formatArrival` IN `packages/shared-types/src/delivery-window.ts`. The web
 * page and the emailed receipt call that function; this file says the same sentences, and
 * `DeliveryWindowTextTest` runs it against the SAME fixture the TypeScript is tested with. A shopper
 * who is told "Today, 5 pm – 7 pm" on the web and "2026-10-08" in the app has been told two things.
 *
 *   window, today        → "Today, 5 pm – 7 pm"
 *   window, another day  → "Thu 8 Oct, 5 pm – 7 pm"
 *   no window, one day   → "Today" / "Tomorrow" / "Thu 8 Oct"
 *   no window, a range   → "Thu 8 Oct – Sat 10 Oct"
 *   no dates             → "We'll confirm your delivery date"
 *
 * ⚠ When there is no promise this SAYS SO rather than inventing one. Every order placed before 069
 * reads the last line.
 *
 * ⚠ ALWAYS MELBOURNE TIME, whatever the phone's zone (FR-029). `offsetAt` is how; it is a parameter so
 * the test can prove the arithmetic without depending on the host's timezone database.
 */
object DeliveryWindowText {
    const val UNCONFIRMED = "We'll confirm your delivery date"

    private val WEEKDAYS = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
    private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    private const val DAY_MS = 86_400_000L

    fun formatArrival(
        promisedFrom: String?,
        promisedTo: String?,
        windowStart: String?,
        windowEnd: String?,
        nowEpochMillis: Long,
        offsetAt: (Long) -> Int = ::melbourneOffsetSeconds,
    ): String {
        val today = isoDay(wallClock(nowEpochMillis, offsetAt).epochDay)

        val start = windowStart?.let(::epochMillisOrNull)
        val end = windowEnd?.let(::epochMillisOrNull)
        if (start != null && end != null) {
            val day = isoDay(wallClock(start, offsetAt).epochDay)
            return "${relativeDay(day, today)}, ${formatWindow(start, end, offsetAt)}"
        }

        val from = promisedFrom ?: promisedTo ?: return UNCONFIRMED
        val to = promisedTo ?: from
        return if (from == to) relativeDay(from, today) else "${formatDay(from)} – ${formatDay(to)}"
    }

    /** "5 pm – 7 pm", in Melbourne time. */
    fun formatWindow(startEpochMillis: Long, endEpochMillis: Long, offsetAt: (Long) -> Int = ::melbourneOffsetSeconds): String {
        val s = wallClock(startEpochMillis, offsetAt)
        val e = wallClock(endEpochMillis, offsetAt)
        return "${clock(s.hour, s.minute)} – ${clock(e.hour, e.minute)}"
    }

    /** The same, from the wire's ISO instants. Null when either cannot be read. */
    fun formatWindow(startIso: String, endIso: String): String? {
        val s = epochMillisOrNull(startIso) ?: return null
        val e = epochMillisOrNull(endIso) ?: return null
        return formatWindow(s, e)
    }

    /** "Thu 8 Oct" from yyyy-mm-dd. A calendar date has no timezone: this is arithmetic on the string. */
    fun formatDay(isoDate: String): String {
        val day = epochDayOrNull(isoDate) ?: return isoDate
        val (_, month, dom) = civil(day)
        // 1970-01-01 was a Thursday.
        val weekday = WEEKDAYS[(((day % 7) + 7 + 4) % 7).toInt()]
        return "$weekday $dom ${MONTHS[month - 1]}"
    }

    /** "Today" / "Tomorrow" where it applies, otherwise the date. */
    fun relativeDay(isoDate: String, todayIso: String): String {
        val day = epochDayOrNull(isoDate) ?: return isoDate
        val today = epochDayOrNull(todayIso) ?: return formatDay(isoDate)
        return when (day - today) {
            0L -> "Today"
            1L -> "Tomorrow"
            else -> formatDay(isoDate)
        }
    }

    /** Melbourne's calendar date at an instant, yyyy-mm-dd. */
    fun melbourneDay(epochMillis: Long, offsetAt: (Long) -> Int = ::melbourneOffsetSeconds): String =
        isoDay(wallClock(epochMillis, offsetAt).epochDay)

    @OptIn(ExperimentalTime::class)
    fun epochMillisOrNull(iso: String): Long? = runCatching { Instant.parse(iso).toEpochMilliseconds() }.getOrNull()

    // ── arithmetic ──────────────────────────────────────────────────────────────────────────────────

    private data class Wall(val epochDay: Long, val hour: Int, val minute: Int)

    private fun wallClock(epochMillis: Long, offsetAt: (Long) -> Int): Wall {
        val local = epochMillis + offsetAt(epochMillis) * 1000L
        val day = floorDiv(local, DAY_MS)
        val ofDay = local - day * DAY_MS
        return Wall(day, (ofDay / 3_600_000L).toInt(), ((ofDay % 3_600_000L) / 60_000L).toInt())
    }

    private fun floorDiv(a: Long, b: Long): Long = if (a >= 0) a / b else -((-a + b - 1) / b)

    /** "5 pm", "5:30 pm", "12 pm" (noon), "12 am" (midnight). */
    private fun clock(hour: Int, minute: Int): String {
        val h12 = if (hour % 12 == 0) 12 else hour % 12
        val suffix = if (hour < 12) "am" else "pm"
        return if (minute == 0) "$h12 $suffix" else "$h12:${minute.toString().padStart(2, '0')} $suffix"
    }

    private fun isoDay(epochDay: Long): String {
        val (y, m, d) = civil(epochDay)
        return "${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}"
    }

    /** Days since 1970-01-01 → (year, month, day). Howard Hinnant's civil-from-days. */
    private fun civil(epochDay: Long): Triple<Int, Int, Int> {
        val z = epochDay + 719_468
        val era = floorDiv(z, 146_097)
        val doe = z - era * 146_097
        val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = (doy - (153 * mp + 2) / 5 + 1).toInt()
        val m = (if (mp < 10) mp + 3 else mp - 9).toInt()
        val y = (yoe + era * 400 + if (m <= 2) 1 else 0).toInt()
        return Triple(y, m, d)
    }

    /** yyyy-mm-dd → days since 1970-01-01, or null when it is not a real date. */
    private fun epochDayOrNull(isoDate: String): Long? {
        val parts = isoDate.split("-")
        if (parts.size != 3 || isoDate.length != 10) return null
        val y = parts[0].toIntOrNull() ?: return null
        val m = parts[1].toIntOrNull() ?: return null
        val d = parts[2].toIntOrNull() ?: return null
        if (m !in 1..12 || d !in 1..31) return null
        val yy = (if (m <= 2) y - 1 else y).toLong()
        val era = floorDiv(yy, 400)
        val yoe = yy - era * 400
        val doy = (153 * (if (m > 2) m - 3 else m + 9) + 2) / 5 + d - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        val day = era * 146_097 + doe - 719_468
        // Round-trips, so 2026-02-30 is refused rather than read as 2 March.
        return if (isoDay(day) == isoDate) day else null
    }
}
