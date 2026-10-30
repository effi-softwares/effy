package com.effyshopping.customer.mobile.core.theme

import com.effyshopping.customer.mobile.core.storage.InMemoryDevicePreferences
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.core.storage.clearGuestData
import kotlin.test.Test
import kotlin.test.assertEquals

/** Light, Dark, or Match my phone; remembered on the device, never cleared with data. */
class AppearanceModeTest {

    @Test
    fun `match my phone follows the phone, the others ignore it`() {
        assertEquals(true, AppearanceMode.System.resolveDark(systemInDark = true))
        assertEquals(false, AppearanceMode.System.resolveDark(systemInDark = false))
        assertEquals(false, AppearanceMode.Light.resolveDark(systemInDark = true))
        assertEquals(true, AppearanceMode.Dark.resolveDark(systemInDark = false))
    }

    @Test
    fun `an unknown or missing value follows the phone`() {
        assertEquals(AppearanceMode.System, AppearanceMode.fromStorage(null))
        assertEquals(AppearanceMode.System, AppearanceMode.fromStorage("sepia"))
        AppearanceMode.entries.forEach { assertEquals(it, AppearanceMode.fromStorage(it.storageValue)) }
    }

    @Test
    fun `signing out leaves the appearance alone - it is a device setting`() {
        val prefs = InMemoryDevicePreferences()
        prefs.putString(PreferenceKeys.APPEARANCE_MODE, "dark")
        prefs.clearGuestData()
        assertEquals("dark", prefs.getString(PreferenceKeys.APPEARANCE_MODE))
    }
}
