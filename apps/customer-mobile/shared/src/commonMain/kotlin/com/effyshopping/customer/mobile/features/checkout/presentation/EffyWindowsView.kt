package com.effyshopping.customer.mobile.features.checkout.presentation

import com.effyshopping.customer.mobile.core.platform.melbourneOffsetSeconds
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.checkout.domain.EffyDay
import com.effyshopping.customer.mobile.features.checkout.domain.EffyDayClosed
import com.effyshopping.customer.mobile.features.checkout.domain.EffyWindows

/**
 * The delivery-window picker, as words (078).
 *
 * ⚠ THE KOTLIN TWIN OF `effyWindowsView` IN `packages/shared-types/src/effy-windows.ts`. The website
 * renders that function's output; this app renders this one's, and `EffyWindowsViewTest` runs it
 * against the SAME fixture the TypeScript is tested with. A shopper offered "Fri 9 Oct · 4 pm – 6 pm"
 * on the web and something else in the app has been offered two things.
 *
 * ⚠ NOTHING HERE FORMATS MONEY. A surcharge leaves as the amount it arrived as.
 */
data class EffyWindowLine(
    val slotId: String,
    val date: String,
    /** "4 pm – 6 pm". */
    val label: String,
    /** Today only: "Order by 2 pm", or "Closed" once that moment has passed. Null on a later day. */
    val note: String?,
    /** Its cutoff has passed since the quote was taken: shown, greyed, and not choosable. */
    val closed: Boolean,
    /** What it adds, e.g. "2.00"; null when it adds nothing. */
    val surchargeAmount: String?,
)

data class EffyDayView(
    val date: String,
    /** "Thu 8 Oct". */
    val label: String,
    /** Why there is nothing to choose that day; null when there is. */
    val sentence: String?,
    val windows: List<EffyWindowLine>,
)

data class EffyWindowsView(
    /** The one sentence when NO day has a window; the sections are then not shown. */
    val unavailable: String?,
    val sameDayTitle: String,
    val standardTitle: String,
    val today: EffyDayView?,
    val later: List<EffyDayView>,
)

fun effyWindowsView(
    windows: EffyWindows,
    nowEpochMillis: Long,
    offsetAt: (Long) -> Int = ::melbourneOffsetSeconds,
): EffyWindowsView {
    fun sentence(day: EffyDay): String? = when {
        day.windows.isNotEmpty() -> null
        day.closedReason == EffyDayClosed.NotDeliveryDay -> DeliveryWindowWords.TODAY_NOT_DELIVERY_DAY
        day.today -> DeliveryWindowWords.TODAY_CLOSED
        else -> DeliveryWindowWords.DAY_FULL
    }

    fun view(day: EffyDay) = EffyDayView(
        date = day.date,
        label = DeliveryWindowText.formatDay(day.date),
        sentence = sentence(day),
        windows = day.windows.map { w ->
            val cutoff = DeliveryWindowText.epochMillisOrNull(w.cutoffAt)
            val closed = cutoff != null && nowEpochMillis > cutoff
            EffyWindowLine(
                slotId = w.slotId,
                date = w.date,
                label = DeliveryWindowText.formatWindow(w.startAt, w.endAt).orEmpty(),
                // The time to order by is today's business; a later day's is days away and would only be noise.
                note = when {
                    !day.today -> null
                    closed -> "Closed"
                    cutoff == null -> null
                    else -> "${DeliveryWindowWords.CUTOFF_PREFIX} ${DeliveryWindowText.formatMoment(cutoff, nowEpochMillis, offsetAt)}"
                },
                closed = closed,
                surchargeAmount = w.surchargeAmount.takeIf { (it.toDoubleOrNull() ?: 0.0) > 0.0 },
            )
        },
    )

    return EffyWindowsView(
        unavailable = if (windows.unavailable != null) DeliveryWindowWords.NO_WINDOWS else null,
        sameDayTitle = DeliveryWindowWords.SECTION_SAME_DAY,
        standardTitle = DeliveryWindowWords.SECTION_STANDARD,
        today = windows.days.firstOrNull { it.today }?.let(::view),
        later = windows.days.filter { !it.today }.map(::view),
    )
}
