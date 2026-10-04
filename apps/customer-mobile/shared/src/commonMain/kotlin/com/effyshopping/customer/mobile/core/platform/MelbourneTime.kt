package com.effyshopping.customer.mobile.core.platform

/**
 * How far Australia/Melbourne is from UTC, in seconds, at an instant (069).
 *
 * A delivery happens in Melbourne wherever the phone is, so a delivery window is always said in
 * Melbourne time (FR-029). The Kotlin standard library has instants but no timezone database, and this
 * app deliberately carries no date-time dependency — so the ONE thing that needs the database is asked
 * of the platform, which has always had it.
 *
 * ⚠ Asked per instant, never cached as "+10" or "+11": the offset changes twice a year, and a
 * delivery booked across the change is exactly when a cached value is wrong.
 */
expect fun melbourneOffsetSeconds(epochMillis: Long): Int
