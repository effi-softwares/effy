package com.effyshopping.driver.mobile.features.map.data

import com.effyshopping.driver.mobile.core.placeholder.Sourced
import com.effyshopping.driver.mobile.core.placeholder.decorative

/**
 * What the map cannot honestly show (060 US3, US2).
 *
 * ⚠ **The map is now a SCHEMATIC, not cartography.** Real MapLibre/OpenStreetMap rendering was
 * built and then removed (it aborts the app under Xcode's debug build). That loses less than it
 * sounds: 049 R13 recorded that shops carry no address or coordinates and orders carry an
 * un-geocoded address, so real cartography was always going to show genuine streets with
 * **invented pins**.
 */
object MapPlaceholders {

    /**
     * The drawn route.
     *
     * ⚠ **Decorative, and deliberately ABSTRACT.** It encodes order and count — which the
     * platform does know — and nothing about geography, which it does not. A stylised route that
     * looked map-like would imply positions that do not exist, which is the lie FR-015 exists to
     * prevent. Routing goes through **Navigate**, with the real address string.
     */
    val routeSchematic: Sourced<String> =
        decorative("order-only", "`shop.address` + geocoding, and geocoded customer addresses")
}
