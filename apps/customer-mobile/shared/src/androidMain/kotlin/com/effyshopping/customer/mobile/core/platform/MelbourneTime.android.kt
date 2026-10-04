package com.effyshopping.customer.mobile.core.platform

import java.util.TimeZone

private val melbourne: TimeZone = TimeZone.getTimeZone("Australia/Melbourne")

actual fun melbourneOffsetSeconds(epochMillis: Long): Int = melbourne.getOffset(epochMillis) / 1000
