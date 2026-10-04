package com.effyshopping.driver.mobile.features.delivery.domain

import kotlin.time.ExperimentalTime
import kotlin.time.Instant

/**
 * The time window the customer was sold for a same-day delivery (069).
 *
 * [label] is the window in words, in Melbourne time ("5 pm – 7 pm"), exactly as the SERVER wrote it.
 * ⚠ This app never formats a time: it has no timezone database, and a second wording is how the
 * driver's screen and the customer's receipt end up disagreeing about the same promise. The instants
 * are here for one purpose — telling whether the window is open, still to come, or missed.
 */
data class DeliveryWindow(
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val label: String,
) {
    companion object {
        /**
         * From the wire: the server's label and the two ISO instants. Null unless ALL THREE are
         * present and readable — half a window is not a promise, and an order placed before 069 has
         * none, in which case the screens show no window at all.
         */
        @OptIn(ExperimentalTime::class)
        fun of(label: String?, startAt: String?, endAt: String?): DeliveryWindow? {
            if (label.isNullOrBlank() || startAt == null || endAt == null) return null
            val start = runCatching { Instant.parse(startAt).toEpochMilliseconds() }.getOrNull() ?: return null
            val end = runCatching { Instant.parse(endAt).toEpochMilliseconds() }.getOrNull() ?: return null
            return DeliveryWindow(start, end, label)
        }
    }
}

/** Where a drop stands against its window right now. */
enum class WindowState(
    /** The word shown beside the window. Empty before it opens: there is nothing to say yet. */
    val word: String,
) {
    Upcoming(""),
    Due("Due now"),
    Late("Late"),
}

/**
 * Upcoming until the window opens, due while it is open, late once it has closed (069 FR-032).
 *
 * ⚠ THE KOTLIN TWIN OF `windowStateAt` IN `packages/shared-types/src/delivery-window.ts`, which the
 * dispatcher's console uses. `DeliveryWindowTest` runs both against the same fixture: a dispatcher
 * told a drop is late while the driver's app says it is due is two people working from different
 * facts. The window's end is inclusive.
 *
 * ⚠ Derived HERE, from the clock, and never sent by the server: it changes while the screen is open.
 */
fun windowStateAt(nowEpochMillis: Long, window: DeliveryWindow): WindowState = when {
    nowEpochMillis < window.startEpochMillis -> WindowState.Upcoming
    nowEpochMillis <= window.endEpochMillis -> WindowState.Due
    else -> WindowState.Late
}

/**
 * What to say about a drop's window, or null when it has none.
 *
 * ⚠ A FINISHED DROP IS NEVER CALLED LATE HERE. Whether it arrived inside its window is recorded
 * against the time it actually arrived; "late" on the driver's screen means "the window has closed
 * and you have not been".
 */
fun windowNote(window: DeliveryWindow?, status: DropStatus, nowEpochMillis: Long): Pair<String, WindowState>? {
    window ?: return null
    val finished = status == DropStatus.DELIVERED || status == DropStatus.FAILED
    return window.label to if (finished) WindowState.Upcoming else windowStateAt(nowEpochMillis, window)
}
