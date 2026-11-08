package com.effyshopping.customer.mobile.features.notifications.domain

import com.effyshopping.customer.mobile.core.platform.melbourneOffsetSeconds
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText

/** A day heading in the inbox and the items under it, newest first. */
data class InboxGroup(val heading: String, val items: List<InboxItem>)

/**
 * Today / Yesterday / Earlier on Effy's clock (110 R21), whatever the phone's zone. [offsetAt] is a parameter so the
 * test does not depend on the host's timezone database.
 */
object InboxGrouping {
    fun group(
        items: List<InboxItem>,
        nowEpochMillis: Long,
        offsetAt: (Long) -> Int = ::melbourneOffsetSeconds,
    ): List<InboxGroup> {
        val today = DeliveryWindowText.melbourneDay(nowEpochMillis, offsetAt)
        val yesterday = DeliveryWindowText.melbourneDay(nowEpochMillis - 86_400_000L, offsetAt)
        val byHeading = linkedMapOf<String, MutableList<InboxItem>>()
        for (item in items) {
            val at = DeliveryWindowText.epochMillisOrNull(item.createdAt)
            val day = at?.let { DeliveryWindowText.melbourneDay(it, offsetAt) }
            val heading = when (day) {
                today -> "Today"
                yesterday -> "Yesterday"
                else -> "Earlier"
            }
            byHeading.getOrPut(heading) { mutableListOf() }.add(item)
        }
        return listOf("Today", "Yesterday", "Earlier").mapNotNull { h -> byHeading[h]?.let { InboxGroup(h, it) } }
    }

    /** "9:12 am" today and yesterday, "Thu 8 Oct" before that. */
    fun timeLabel(item: InboxItem, nowEpochMillis: Long, offsetAt: (Long) -> Int = ::melbourneOffsetSeconds): String {
        val at = DeliveryWindowText.epochMillisOrNull(item.createdAt) ?: return ""
        val daysAgo = dayNumber(nowEpochMillis, offsetAt) - dayNumber(at, offsetAt)
        return if (daysAgo <= 1) {
            DeliveryWindowText.formatMoment(at, at, offsetAt)
        } else {
            DeliveryWindowText.formatDay(DeliveryWindowText.melbourneDay(at, offsetAt))
        }
    }

    private fun dayNumber(epochMillis: Long, offsetAt: (Long) -> Int): Long {
        val local = epochMillis + offsetAt(epochMillis) * 1000L
        return if (local >= 0) local / 86_400_000L else -((-local + 86_400_000L - 1) / 86_400_000L)
    }
}
