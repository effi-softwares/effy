package com.effyshopping.customer.mobile.core.theme

/**
 * The user's chosen appearance (017 US2 / FR-009). [System] follows the device; [Light]/[Dark] force
 * it. Resolved to a concrete "is dark?" at render time via [resolveDark], so `System` is the only mode
 * that consults the device setting.
 *
 * The default for a user who has never chosen is [System] (FR-013) — see [fromStorage].
 */
enum class AppearanceMode {
    Light,
    Dark,
    System;

    /** Resolve to dark-or-light. Only [System] consults [systemInDark] (the live device setting). */
    fun resolveDark(systemInDark: Boolean): Boolean =
        when (this) {
            Light -> false
            Dark -> true
            System -> systemInDark
        }

    /** Stable token for persistence (never localize / never derive from `name`). */
    val storageValue: String
        get() =
            when (this) {
                Light -> "light"
                Dark -> "dark"
                System -> "system"
            }

    companion object {
        /** Parse a persisted token; unknown or absent → [System] (FR-013 default). */
        fun fromStorage(value: String?): AppearanceMode =
            when (value) {
                "light" -> Light
                "dark" -> Dark
                else -> System
            }
    }
}
