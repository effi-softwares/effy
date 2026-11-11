package com.effyshopping.driver.mobile.features.inbox

import com.effyshopping.driver.mobile.core.push.DriverDestination
import com.effyshopping.driver.mobile.features.inbox.domain.InboxItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** 112 FR-033: a message from Effy opens its sheet (with its picture) first; a run notice goes straight to its run. */
class InboxMessageTest {
    private fun item(type: String, destination: DriverDestination? = DriverDestination.Today, imageUrl: String? = null) =
        InboxItem(
            id = "n1", type = type, category = "announcements", important = false, title = "T", body = "B",
            destination = destination, createdAt = "2026-11-11T00:00:00.000000Z", read = false, imageUrl = imageUrl,
        )

    @Test
    fun `a message opens its sheet first`() {
        assertTrue(item("driver_message").opensDetail)
        assertTrue(item("driver_message").isMessage)
    }

    @Test
    fun `a work notice goes straight where it leads, unless this build can't open it`() {
        assertFalse(item("run_assigned").opensDetail)
        assertTrue(item("run_assigned", destination = null).opensDetail)
    }

    @Test
    fun `the picture rides on the item`() {
        assertEquals("https://media.example.test/a.webp", item("driver_message", imageUrl = "https://media.example.test/a.webp").imageUrl)
    }
}
