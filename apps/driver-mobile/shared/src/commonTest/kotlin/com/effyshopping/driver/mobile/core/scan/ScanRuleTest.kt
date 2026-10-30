package com.effyshopping.driver.mobile.core.scan

import com.effyshopping.driver.mobile.features.collection.domain.CollectionPackage
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.CollectionStop
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropPackage
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
import com.effyshopping.driver.mobile.features.delivery.domain.ReturnParcel
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** One rule, every step. */
class ScanRuleTest {
    private fun label(code: String) = "EFY1:$code"
    private fun bags(vararg codes: String) = codes.map { Bag(it, 1, 1, BagZone.AMBIENT) }

    // S1 - at a shop
    private val run = CollectionRun(
        runId = "r1", status = "active",
        stops = listOf(
            CollectionStop("s1", 1, "Green Grocer", "GG", 2, StopStatus.ASSIGNED, bags = bags("AAAAAA", "BBBBBB")),
            CollectionStop("s2", 2, "Fish Co", "FC", 1, StopStatus.ASSIGNED, bags = bags("CCCCCC")),
        ),
    )
    private fun pkg(code: String) = CollectionPackage("EFY-1", "Richmond", emptyList(), ClassSummary.Empty, goesToCourier = false, packageId = code, packageCode = code, bags = bags(code))
    private val stop = ShopStop("s1", "Green Grocer", "GG", listOf(pkg("AAAAAA"), pkg("BBBBBB")), StopStatus.ASSIGNED)

    @Test fun at_a_shop_each_expected_package_counts_once_and_the_stop_completes() {
        val s = ScanSession(ScanContexts.shopStop(run, stop))
        assertEquals(ScanOutcome.Accepted("AAAAAA"), s.judge(label("AAAAAA")))
        assertEquals(ScanOutcome.AlreadyScanned("AAAAAA"), s.judge(label("AAAAAA")))
        assertEquals(1, s.scannedCount)
        assertFalse(s.isComplete)
        s.judge(label("BBBBBB"))
        assertTrue(s.isComplete)
    }

    @Test fun at_a_shop_another_stops_package_is_a_hard_stop_naming_it() {
        val s = ScanSession(ScanContexts.shopStop(run, stop))
        assertEquals(ScanOutcome.BelongsElsewhere("CCCCCC", "Fish Co"), s.judge(label("CCCCCC")))
        assertEquals(0, s.scannedCount)
    }

    @Test fun a_label_for_nothing_on_the_work_and_a_product_barcode() {
        val s = ScanSession(ScanContexts.shopStop(run, stop))
        assertEquals(ScanOutcome.NotOnYourWork("ZZZZZZ"), s.judge(label("ZZZZZZ")))
        assertEquals(ScanOutcome.NotALabel, s.judge("9300633603345"))
        assertEquals(ScanOutcome.NotALabel, s.judge("EFY1:0000OO"))
    }

    /** A torn label: the code typed by hand goes through the same rule. */
    @Test fun a_typed_code_is_judged_the_same_way() {
        val s = ScanSession(ScanContexts.shopStop(run, stop))
        assertEquals(ScanOutcome.Accepted("BBBBBB"), s.judge(" BBBBBB "))
    }

    // S2 - at the hub
    @Test fun at_the_hub_every_package_on_the_run_is_expected() {
        val s = ScanSession(ScanContexts.hub(run))
        listOf("AAAAAA", "BBBBBB", "CCCCCC").forEach { assertIs<ScanOutcome.Accepted>(s.judge(label(it))) }
        assertTrue(s.isComplete)
    }

    // S3 / S4 - the van and the door
    private val deliveryRun = DeliveryRun(
        runId = "d1", status = "active",
        drops = listOf(
            DropSummary("p1", 1, "EFY-1", "Carlton", 2, DropStatus.STAGED, bags = bags("DDDDDD", "EEEEEE")),
            DropSummary("p2", 2, "EFY-2", "Fitzroy", 1, DropStatus.STAGED, bags = bags("FFFFFF")),
        ),
    )
    private val drop = Drop(
        dropId = "p1", orderRef = "EFY-1", customerName = "A", addressFull = "1 St", instructions = null,
        packages = listOf(DropPackage("EFY-1", 1, packageCode = "DDDDDD", bags = bags("DDDDDD")), DropPackage("EFY-1", 1, packageCode = "EEEEEE", bags = bags("EEEEEE"))),
        status = DropStatus.ARRIVED,
    )

    @Test fun loading_the_van_expects_every_package_on_the_run() {
        val s = ScanSession(ScanContexts.load(deliveryRun))
        assertEquals(3, s.expectedCount)
    }

    @Test fun at_the_door_the_wrong_customers_bag_is_a_hard_stop() {
        val s = ScanSession(ScanContexts.drop(deliveryRun, drop))
        assertEquals(ScanOutcome.BelongsElsewhere("FFFFFF", "Drop 2 · Fitzroy"), s.judge(label("FFFFFF")))
        assertEquals(ScanOutcome.Accepted("DDDDDD"), s.judge(label("DDDDDD")))
        assertFalse(s.isComplete)
        s.judge(label("EEEEEE"))
        assertTrue(s.isComplete)
    }

    // S5 - return
    @Test fun returning_expects_the_parcels_to_return() {
        val s = ScanSession(ScanContexts.returnToHub(ParcelsToReturn("d1", 1, listOf("EFY-2"), listOf(ReturnParcel("EFY-2", "FFFFFF", null, null, bags("FFFFFF"))))))
        assertEquals(ScanOutcome.Accepted("FFFFFF"), s.judge(label("FFFFFF")))
        assertTrue(s.isComplete)
    }

    @Test fun undo_forgets_a_scan() {
        val s = ScanSession(ScanContexts.returnToHub(ParcelsToReturn("d1", 1, listOf("EFY-2"), listOf(ReturnParcel("EFY-2", "FFFFFF", null, null, bags("FFFFFF"))))))
        s.judge(label("FFFFFF"))
        s.forget("FFFFFF")
        assertFalse(s.isComplete)
    }

    /** Nothing expected (an older server sent no codes) is never "complete" - nothing auto-sends. */
    @Test fun a_step_with_no_codes_never_completes_by_itself() {
        assertFalse(ScanSession(ScanContext(emptySet())).isComplete)
    }
}
