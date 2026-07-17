package com.effyshopping.shop.mobile.core.theme

import kotlin.test.Test
import kotlin.test.assertEquals

/** 017 US2 — the appearance resolver: System defers to the device; Light/Dark force; default is System. */
class AppearanceModeTest {

    @Test fun light_isAlwaysLight() {
        assertEquals(false, AppearanceMode.Light.resolveDark(systemInDark = true))
        assertEquals(false, AppearanceMode.Light.resolveDark(systemInDark = false))
    }

    @Test fun dark_isAlwaysDark() {
        assertEquals(true, AppearanceMode.Dark.resolveDark(systemInDark = true))
        assertEquals(true, AppearanceMode.Dark.resolveDark(systemInDark = false))
    }

    @Test fun system_followsTheDevice() {
        assertEquals(true, AppearanceMode.System.resolveDark(systemInDark = true))
        assertEquals(false, AppearanceMode.System.resolveDark(systemInDark = false))
    }

    @Test fun unknownOrAbsentStorage_defaultsToSystem() {
        assertEquals(AppearanceMode.System, AppearanceMode.fromStorage(null))
        assertEquals(AppearanceMode.System, AppearanceMode.fromStorage("nonsense"))
        assertEquals(AppearanceMode.System, AppearanceMode.fromStorage("system"))
    }

    @Test fun storageRoundTrips() {
        for (mode in AppearanceMode.entries) {
            assertEquals(mode, AppearanceMode.fromStorage(mode.storageValue))
        }
    }
}
