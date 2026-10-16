package com.effyshopping.driver.mobile.core.scan

import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn

/**
 * 090 — what each scanning step expects, built from the work the phone already holds (089 put every
 * package's code on it). One builder per step (docs/driver-app-barcode-scanning.md §2, S1–S5).
 */
object ScanContexts {
    /** S1 — at a shop: this stop's packages; another stop's package is a hard stop naming that shop. */
    fun shopStop(run: CollectionRun, stop: ShopStop): ScanContext = ScanContext(
        expected = stop.packages.mapNotNull { it.packageCode }.toSet(),
        elsewhere = run.stops
            .filter { it.stopId != stop.stopId }
            .flatMap { other -> other.packageCodes.map { it to other.shopName } }
            .toMap(),
    )

    /** S2 — at the hub: every package collected on the run. */
    fun hub(run: CollectionRun): ScanContext = ScanContext(
        expected = (run.stops.flatMap { it.packageCodes } + run.hubSort.map { it.packageCode }).toSet(),
    )

    /** S3 — loading the van: every package on the delivery run. */
    fun load(run: DeliveryRun): ScanContext = ScanContext(
        expected = run.drops.flatMap { it.packageCodes }.toSet(),
    )

    /**
     * S4 — at the door: this drop's packages. ⚠ Another drop's package is the hard stop — the wrong
     * customer's bag — named by its drop number and suburb.
     */
    fun drop(run: DeliveryRun, drop: Drop): ScanContext = ScanContext(
        expected = drop.packages.mapNotNull { it.packageCode }.toSet(),
        elsewhere = run.drops
            .filter { it.dropId != drop.dropId }
            .flatMap { other -> other.packageCodes.map { it to "Drop ${other.sequence} · ${other.customerSuburb}" } }
            .toMap(),
    )

    /** S5 — back at the hub after failed drops: the parcels to return. */
    fun returnToHub(toReturn: ParcelsToReturn): ScanContext = ScanContext(expected = toReturn.packageCodes.toSet())
}
