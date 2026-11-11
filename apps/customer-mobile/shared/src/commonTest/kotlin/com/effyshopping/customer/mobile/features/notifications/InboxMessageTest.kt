package com.effyshopping.customer.mobile.features.notifications

import com.effyshopping.customer.mobile.core.push.CustomerDestination
import com.effyshopping.customer.mobile.features.notifications.domain.InboxItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** 112 FR-033: a message from Effy opens its sheet (with its picture) first; an order update goes straight where it leads. */
class InboxMessageTest {
    private fun item(type: String, category: String, destination: CustomerDestination? = CustomerDestination.Orders, imageUrl: String? = null) =
        InboxItem(
            id = "n1", type = type, category = category, important = false, title = "T", body = "B",
            destination = destination, createdAt = "2026-11-11T00:00:00.000000Z", read = false, endsLabel = null, imageUrl = imageUrl,
        )

    @Test
    fun `a message opens its sheet, whatever its category`() {
        assertTrue(item("customer_message", "important").opensDetail)
        assertTrue(item("customer_message", "support").opensDetail)
        assertTrue(item("customer_message", "important").isMessage)
    }

    @Test
    fun `offers and news open their sheet, and anything with no known destination does`() {
        assertTrue(item("customer_message", "offers").opensDetail)
        assertTrue(item("order_paid", "orders", destination = null).opensDetail)
    }

    @Test
    fun `an order update goes straight where it leads`() {
        assertFalse(item("order_paid", "orders").opensDetail)
        assertFalse(item("order_paid", "orders").isMessage)
    }

    @Test
    fun `the picture rides on the item`() {
        assertEquals("https://media.example.test/a.webp", item("customer_message", "important", imageUrl = "https://media.example.test/a.webp").imageUrl)
    }
}
