package com.effyshopping.customer.mobile.features.notifications

import com.effyshopping.customer.mobile.features.notifications.domain.InboxGrouping
import com.effyshopping.customer.mobile.features.notifications.domain.InboxItem
import kotlin.test.Test
import kotlin.test.assertEquals

/** Today / Yesterday / Earlier on Effy's clock, not the phone's (110 R21). Melbourne is UTC+11 in November. */
class InboxGroupingTest {
    private val melbourne: (Long) -> Int = { 11 * 3600 }
    private fun item(id: String, at: String) = InboxItem(id, "order_paid", "orders", false, "t", "b", null, at, false, null)

    // 2026-11-09 10:00 in Melbourne.
    private val now = 1_794_178_800_000L

    @Test
    fun groups_by_effy_day() {
        val groups = InboxGrouping.group(
            listOf(
                item("today-early", "2026-11-08T13:30:00.000000Z"), // 00:30 on the 9th in Melbourne
                item("yesterday", "2026-11-08T12:59:00.000000Z"), // 23:59 on the 8th
                item("earlier", "2026-11-06T01:00:00.000000Z"),
            ),
            now,
            melbourne,
        )
        assertEquals(listOf("Today" to listOf("today-early"), "Yesterday" to listOf("yesterday"), "Earlier" to listOf("earlier")), groups.map { g -> g.heading to g.items.map { it.id } })
    }

    @Test
    fun says_the_time_today_and_yesterday_and_the_date_before() {
        assertEquals("12:30 am", InboxGrouping.timeLabel(item("x", "2026-11-08T13:30:00.000000Z"), now, melbourne))
        assertEquals("Fri 6 Nov", InboxGrouping.timeLabel(item("y", "2026-11-06T01:00:00.000000Z"), now, melbourne))
    }
}
