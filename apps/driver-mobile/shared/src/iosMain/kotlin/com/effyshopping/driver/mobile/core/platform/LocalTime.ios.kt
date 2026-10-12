package com.effyshopping.driver.mobile.core.platform

import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.Foundation.NSLocale
import platform.Foundation.dateWithTimeIntervalSince1970

private fun format(epochMillis: Long, pattern: String): String {
    val formatter = NSDateFormatter()
    // A fixed locale, so the pattern means the same on a phone set to a 24-hour clock or another language.
    formatter.locale = NSLocale(localeIdentifier = "en_AU_POSIX")
    formatter.dateFormat = pattern
    return formatter.stringFromDate(NSDate.dateWithTimeIntervalSince1970(epochMillis / 1000.0))
}

actual fun localTimeText(epochMillis: Long, withDay: Boolean): String =
    format(epochMillis, if (withDay) "EEE d MMM, h:mm a" else "h:mm a")
        .replace("AM", "am")
        .replace("PM", "pm")

actual fun localDateIso(epochMillis: Long): String = format(epochMillis, "yyyy-MM-dd")

actual fun localHour(epochMillis: Long): Int = format(epochMillis, "H").toIntOrNull() ?: 12
