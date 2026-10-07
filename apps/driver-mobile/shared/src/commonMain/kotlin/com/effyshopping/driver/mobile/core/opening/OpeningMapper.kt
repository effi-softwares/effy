package com.effyshopping.driver.mobile.core.opening

import com.effyshopping.driver.mobile.contract.RoundOpening

/**
 * The wire's opening as the app's (072). ⚠ Null on the wire means the round IS open — the server
 * decides that against its own clock and sends nothing once it is.
 *
 * Here rather than in a feature's data layer because today, collection and delivery all map it, and
 * one of them importing another's mapper is how a feature comes to depend on its neighbour.
 */
internal fun RoundOpening?.toOpening(): Opening? = this?.let { Opening.of(it.at, it.label) }
