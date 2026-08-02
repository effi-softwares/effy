package com.effyshopping.customer.mobile.core.storage

import kotlin.time.Clock
import kotlin.time.ExperimentalTime

/**
 * An ISO-8601 timestamp, for the guest saved list's save time (033).
 *
 * ⚠ `kotlin.time.Clock` from the STDLIB, deliberately — this slice adds no runtime dependency, and
 * `kotlinx-datetime` is not on this app's classpath. It is opt-in experimental, which is why the
 * annotation is confined to this one function rather than sprinkled at call sites.
 */
@OptIn(ExperimentalTime::class)
fun nowIsoTimestamp(): String = Clock.System.now().toString()
