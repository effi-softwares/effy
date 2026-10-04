package com.effyshopping.customer.mobile.core.platform

import platform.Foundation.NSDate
import platform.Foundation.NSTimeZone
import platform.Foundation.dateWithTimeIntervalSince1970
import platform.Foundation.timeZoneWithName

/**
 * ⚠ Falls back to +10:00 (AEST) if the zone cannot be loaded, rather than to UTC: a window an hour out
 * in summer is a smaller lie than one ten hours out all year. iOS has shipped this zone since iOS 2.
 */
actual fun melbourneOffsetSeconds(epochMillis: Long): Int {
    val zone = NSTimeZone.timeZoneWithName("Australia/Melbourne") ?: return 10 * 3600
    return zone.secondsFromGMTForDate(NSDate.dateWithTimeIntervalSince1970(epochMillis / 1000.0)).toInt()
}
