package com.effyshopping.driver.mobile.core.scan

/**
 * The camera sees a label many times a second while it is in view. Each code is passed on at most
 * once per [windowMillis]; a different code is never held back.
 */
class ReadDebouncer(private val windowMillis: Long = 2_000) {
    private val lastSeen = mutableMapOf<String, Long>()

    /** True when [code], seen at [nowMillis], should be reported. */
    fun accept(code: String, nowMillis: Long): Boolean {
        val last = lastSeen[code]
        if (last != null && nowMillis - last < windowMillis) return false
        lastSeen[code] = nowMillis
        return true
    }
}
