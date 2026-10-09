package com.effyshopping.driver.mobile.features.collection

import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import kotlin.test.Test
import kotlin.test.assertEquals

/** 080 P14 — the parcels a courier takes from the hub are counted by who takes them. */
class HubSplitTest {
    @Test
    fun courierCountIsWhatTheScreenUses() {
        assertEquals(3, HubSplit(scannedTotal = 5, sameDayCount = 2, standardCount = 3, courierCount = 3).toCourier)
        // A later-day Effy parcel is "standard" to the customer but not a courier's.
        assertEquals(1, HubSplit(scannedTotal = 5, sameDayCount = 2, standardCount = 3, courierCount = 1).toCourier)
    }

    @Test
    fun aServerOlderThan080FallsBackToTheOldCount() {
        assertEquals(3, HubSplit(scannedTotal = 5, sameDayCount = 2, standardCount = 3).toCourier)
    }
}
