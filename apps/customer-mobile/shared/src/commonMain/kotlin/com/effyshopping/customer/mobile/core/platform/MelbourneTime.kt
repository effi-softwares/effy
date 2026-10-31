package com.effyshopping.customer.mobile.core.platform

import com.effyshopping.customer.mobile.config.BuildKonfig

/** Effy's clock, the twin of `OPERATING_TZ` in `@effy/shared-types`. */
internal val OPERATING_TZ: String = BuildKonfig.OPERATING_TZ.ifBlank { "Australia/Melbourne" }

/**
 * How far Effy's clock is from UTC, in seconds, at an instant.
 *
 * A delivery happens on Effy's clock wherever the phone is, so a delivery window is always said in
 * that time. The Kotlin standard library has instants but no timezone database, and this
 * app deliberately carries no date-time dependency - so the one thing that needs the database is asked
 * of the platform, which has always had it.
 *
 * Asked per instant, never cached as "+10" or "+11": the offset changes twice a year, and a
 * delivery booked across the change is exactly when a cached value is wrong.
 */
expect fun melbourneOffsetSeconds(epochMillis: Long): Int
