package com.effyshopping.driver.mobile.features.collection.data

import com.effyshopping.driver.mobile.core.placeholder.Sourced
import com.effyshopping.driver.mobile.core.placeholder.decorative
import com.effyshopping.driver.mobile.core.placeholder.operational

/**
 * What the collection screens cannot honestly show (060 US2, FR-013…FR-017a).
 *
 * ⚠ **Most of these are OMITTED rather than rendered**, which is exactly why they need declaring.
 * A field that is simply absent from a screen leaves no trace — nobody reading the code six months
 * from now can tell whether it was considered and refused, or never thought of. This file is that
 * trace, and `PlaceholderRegisterGuardTest` keeps it in step with the register.
 */
object CollectionPlaceholders {

    /** ⚠ Design: an ETA per stop. No routing engine, and nothing to route between. */
    val stopEta: Sourced<Nothing?> = operational("A routing provider + shop geodata (049 R13)")

    /** ⚠ Design: "0.6 km" per stop. */
    val stopDistance: Sourced<Nothing?> = operational("Shop geodata — `shop.address` + geocoding")

    /**
     * ⚠ Design: a street address under every shop name. `CollectionStop` carries name and code
     * only, and `shop` has **no address field at all** — the same root cause as the missing
     * coordinates.
     */
    val stopAddress: Sourced<Nothing?> = operational("`shop.address`")

    /** ⚠ Design: "bay 2", "dock A", "rear lane". No premises detail exists on a shop. */
    val bayDetail: Sourced<String> = decorative("", "Premises fields on `shop` (bay, dock, access)")

    /** ⚠ Design: "assigned 9:02 am by dispatch". Not exposed on the run DTO. */
    val assignedAt: Sourced<Nothing?> = operational("An assignment timestamp on the run DTO")

    /** ⚠ Design: "dock 4" on hub check-in. */
    val hubDock: Sourced<String> = decorative("", "Premises fields on the hub")

    /**
     * ⚠ Design: "7 drops across Carlton, Fitzroy…" on hub check-in. The delivery run has not been
     * fetched at that moment, so the drop count is unknown.
     */
    val hubDropCount: Sourced<Nothing?> = operational("A drop count on the check-in response")
}
