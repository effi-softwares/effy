package com.effyshopping.driver.mobile.features.collection

import com.effyshopping.driver.mobile.features.collection.domain.EffyGroup
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 082 P13 - the two groups a driver is shown at hub check-in: Effy's parcels, by the day and window each
 * is for, and the courier's. Only what goes out today is the driver's delivery run.
 */
class HubSplitTest {
    @Test
    fun effyParcelsAreGroupedByDayAndOnlyTodaysAreTheDeliveryRun() {
        val split = HubSplit(
            scannedTotal = 6, toCourier = 1,
            effy = listOf(
                EffyGroup("Today, 4 pm – 6 pm", 2, dueToday = true),
                EffyGroup("Thu 15 Oct, 10 am – 12 pm", 3, dueToday = false),
            ),
        )
        assertEquals(5, split.effyCount)
        assertEquals(2, split.dueToday)
        assertEquals(1, split.toCourier)
    }

    @Test
    fun nothingOfEffysShowsNoGroup() {
        val split = HubSplit(scannedTotal = 3, toCourier = 3, effy = emptyList())
        assertTrue(split.effy.isEmpty())
        assertEquals(0, split.dueToday)
    }
}
