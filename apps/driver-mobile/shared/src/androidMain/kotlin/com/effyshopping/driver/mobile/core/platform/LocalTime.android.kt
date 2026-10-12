package com.effyshopping.driver.mobile.core.platform

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

actual fun localTimeText(epochMillis: Long, withDay: Boolean): String =
    SimpleDateFormat(if (withDay) "EEE d MMM, h:mm a" else "h:mm a", Locale.ENGLISH)
        .format(Date(epochMillis))
        .replace("AM", "am")
        .replace("PM", "pm")

actual fun localDateIso(epochMillis: Long): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH).format(Date(epochMillis))

actual fun localHour(epochMillis: Long): Int =
    java.util.Calendar.getInstance().apply { timeInMillis = epochMillis }.get(java.util.Calendar.HOUR_OF_DAY)
