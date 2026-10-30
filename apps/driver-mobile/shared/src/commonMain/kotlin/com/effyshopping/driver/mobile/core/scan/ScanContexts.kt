package com.effyshopping.driver.mobile.core.scan

import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn

/**
 * What each scanning step expects, built from the work the phone already holds. One builder per
 * step (docs/driver-app-barcode-scanning.md §2, S1–S5).
 *
 * What a step counts is bags. Each bag has its own code; a package of three bags is three scans.
 * From an older server (no bags sent) a package's own code stands for its one bag.
 */
object ScanContexts {
    /** S1 - at a shop: this stop's bags; another stop's bag is a hard stop naming that shop. */
    fun shopStop(run: CollectionRun, stop: ShopStop): ScanContext {
        val bags = stop.packages.flatMap { it.bags }
        return ScanContext(
            expected = bags.map { it.code }.toSet(),
            bags = bags.numbers(),
            elsewhere = run.stops
                .filter { it.stopId != stop.stopId }
                .flatMap { other -> other.bagCodes.map { it to other.shopName } }
                .toMap(),
        )
    }

    /** S2 - at the hub: every bag collected on the run. */
    fun hub(run: CollectionRun): ScanContext {
        val bags = run.stops.flatMap { it.bags }
        return ScanContext(
            expected = (run.stops.flatMap { it.bagCodes } + run.hubSort.map { it.packageCode }.filter { bags.isEmpty() }).toSet(),
            bags = bags.numbers(),
        )
    }

    /** S3 - loading the van: every bag on the delivery run. */
    fun load(run: DeliveryRun): ScanContext = ScanContext(
        expected = run.drops.flatMap { it.bagCodes }.toSet(),
        bags = run.drops.flatMap { it.bags }.numbers(),
    )

    /**
     * S4 - at the door: this drop's bags. Another drop's bag is the hard stop - the wrong customer's
     * bag - named by its drop number and suburb.
     */
    fun drop(run: DeliveryRun, drop: Drop): ScanContext {
        val bags = drop.packages.flatMap { it.bags }
        return ScanContext(
            expected = bags.map { it.code }.toSet(),
            bags = bags.numbers(),
            elsewhere = run.drops
                .filter { it.dropId != drop.dropId }
                .flatMap { other -> other.bagCodes.map { it to "Drop ${other.sequence} · ${other.customerSuburb}" } }
                .toMap(),
        )
    }

    /** S5 - back at the hub after failed drops: the bags to return. */
    fun returnToHub(toReturn: ParcelsToReturn): ScanContext = ScanContext(
        expected = toReturn.bagCodes.toSet(),
        bags = toReturn.parcels.flatMap { it.bags }.numbers(),
    )
}
