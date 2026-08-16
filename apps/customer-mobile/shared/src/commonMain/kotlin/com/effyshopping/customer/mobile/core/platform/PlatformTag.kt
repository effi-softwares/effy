package com.effyshopping.customer.mobile.core.platform

/**
 * The surface tag the platform records on a submission (046) — `"ios"` or `"android"`. An `expect fun`
 * returning a String rather than an `expect class`, matching the `devicePreferences()` / motion-level
 * pattern already used in this module.
 */
expect fun platformTag(): String
