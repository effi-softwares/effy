package com.effyshopping.driver.mobile.core.scan

import kotlinx.serialization.Serializable

/** How a package was handed over: scanned from its label, its code typed, or ticked by hand. */
@Serializable
enum class HandMethod { SCAN, TYPED, MANUAL }

/** One package at one hand-over, named by its label code (what every step holds on the phone). */
@Serializable
data class HandedOver(val code: String, val method: HandMethod)
