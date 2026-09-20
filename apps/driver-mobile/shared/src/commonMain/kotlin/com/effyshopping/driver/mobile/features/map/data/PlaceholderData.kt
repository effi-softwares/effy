package com.effyshopping.driver.mobile.features.map.data

import com.effyshopping.driver.mobile.core.placeholder.Sourced
import com.effyshopping.driver.mobile.core.placeholder.decorative

/**
 * What the map cannot honestly show (060 US3, US2).
 *
 * ⚠ **The cartography is REAL; the pins are not.** That asymmetry is the whole story of this
 * screen. OpenFreeMap serves genuine OpenStreetMap data, but 049 R13 recorded — and it is still
 * true — that **shops carry no address or coordinates** and orders carry an **un-geocoded**
 * address. There is nothing on the platform to plot.
 */
object MapPlaceholders {

    /**
     * ⚠ Marker positions. **Decorative rather than operational**, and the distinction matters: the
     * map is illustrative, not navigational. A driver who needs to actually get somewhere uses
     * **Navigate**, which hands the device's own maps app the **real address string** — so no
     * routing decision is ever made from these pins.
     */
    val markerCoordinates: Sourced<String> =
        decorative("hub-relative", "`shop.address` + geocoding, and geocoded customer addresses")

    /**
     * Where the map opens.
     *
     * \u26a0 Found by looking at it on a simulator: with no camera set, the map opened on the
     * library's default position and showed a Melbourne driver the Indian Ocean. Melbourne is the
     * one honest default available \u2014 the platform judges its own delivery cutoffs in
     * `Australia/Melbourne` (047) \u2014 but it is still a constant, not the driver's location.
     */
    val defaultCamera: Sourced<String> =
        decorative("melbourne", "The driver's own location, or a geocoded hub position")
}
