package com.effyshopping.driver.mobile.features.collection

import com.effyshopping.driver.mobile.features.collection.domain.CollectionPackage
import com.effyshopping.driver.mobile.features.collection.domain.EffyGroup
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.PackageMethod
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

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

    /**
     * 082 P13 — the two groups a driver is shown: Effy's parcels, by the day and window each is for,
     * and the courier's. Only what goes out TODAY is the driver's delivery run; a later day's parcels
     * are shelved at the hub.
     */
    @Test
    fun effyParcelsAreGroupedByDayAndOnlyTodaysAreTheDeliveryRun() {
        val split = HubSplit(
            scannedTotal = 6, sameDayCount = 2, standardCount = 4, courierCount = 1,
            effyGroups = listOf(
                EffyGroup("Today, 4 pm – 6 pm", 2, dueToday = true),
                EffyGroup("Thu 15 Oct, 10 am – 12 pm", 3, dueToday = false),
            ),
        )
        assertEquals(listOf("Today, 4 pm – 6 pm", "Thu 15 Oct, 10 am – 12 pm"), split.effy.map { it.label })
        assertEquals(5, split.effyCount)
        assertEquals(2, split.dueToday)
        assertEquals(1, split.toCourier)
    }

    @Test
    fun aServerOlderThan082ShowsItsSameDayCountAsOneGroupForToday() {
        val split = HubSplit(scannedTotal = 5, sameDayCount = 2, standardCount = 3)
        assertEquals(listOf(EffyGroup("Today", 2, dueToday = true)), split.effy)
        assertEquals(2, split.dueToday)
        // Nothing of Effy's: no group at all, never an empty heading.
        assertTrue(HubSplit(scannedTotal = 3, sameDayCount = 0, standardCount = 3).effy.isEmpty())
    }

    @Test
    fun aParcelSaysWhoTakesItNeverTheCustomersWord() {
        val none = ClassSummary(0, 0, 0, 0)
        fun pkg(method: PackageMethod, toCourier: Boolean?) =
            CollectionPackage("EFY-1", "Fitzroy", method, emptyList(), none, toCourier = toCourier, windowLabel = null)
        // A later-day Effy parcel is routed "standard" and is still Effy's.
        assertFalse(pkg(PackageMethod.STANDARD, toCourier = false).goesToCourier)
        assertTrue(pkg(PackageMethod.STANDARD, toCourier = true).goesToCourier)
        // From a server older than 082 the method is all there is.
        assertFalse(pkg(PackageMethod.SAME_DAY, toCourier = null).goesToCourier)
        assertTrue(pkg(PackageMethod.STANDARD, toCourier = null).goesToCourier)
    }
}
