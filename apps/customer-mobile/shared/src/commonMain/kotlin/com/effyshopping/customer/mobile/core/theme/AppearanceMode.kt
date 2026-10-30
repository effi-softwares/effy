package com.effyshopping.customer.mobile.core.theme

/**
 * The shopper's appearance choice (087 / constitution v3.4.0): follow the phone, or always light, or
 * always dark. Chosen in Account → Appearance and remembered on this device (a device setting, not
 * personal data - clearing shopping data leaves it alone).
 */
enum class AppearanceMode(val storageValue: String, val label: String) {
    System("system", "Match my phone"),
    Light("light", "Light"),
    Dark("dark", "Dark"),
    ;

    /** Whether the app is dark, given the phone's own setting. */
    fun resolveDark(systemInDark: Boolean): Boolean = when (this) {
        System -> systemInDark
        Light -> false
        Dark -> true
    }

    companion object {
        /** Unknown or absent → follow the phone. */
        fun fromStorage(value: String?): AppearanceMode = entries.firstOrNull { it.storageValue == value } ?: System
    }
}
