package com.effyshopping.driver.mobile.core.map

/**
 * Rev 2 - where a run's stops roughly are, for the decorative [RunMapView]. A stop's point is its
 * postcode's place (the server's words: never an address, never a device position). Rough by design.
 */
data class RunMap(val stops: List<RunMapStop>, val hub: GeoPoint?)

data class GeoPoint(val lat: Double, val lng: Double)

data class RunMapStop(
    /** The stop's number in the run's list; null for the hub. */
    val n: Int?,
    val kind: Kind,
    val status: Status,
    val point: GeoPoint,
) {
    enum class Kind { SHOP, CUSTOMER, HUB }
    enum class Status { DONE, NEXT, TODO }
}
