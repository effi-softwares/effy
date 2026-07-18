package com.effyshopping.shop.mobile.core.theme

import kotlin.test.Test
import kotlin.test.assertEquals

class AppearancePreferenceStoreTest {
    @Test
    fun absent_or_unknown_values_follow_system() {
        assertEquals(AppearanceMode.System, AppearancePreferenceStore(null) {}.mode.value)
        assertEquals(AppearanceMode.System, AppearancePreferenceStore("future-value") {}.mode.value)
    }

    @Test
    fun every_mode_persists_immediately_with_a_stable_value() {
        val writes = mutableListOf<String>()
        val store = AppearancePreferenceStore(null, writes::add)
        store.setMode(AppearanceMode.Light)
        assertEquals(AppearanceMode.Light, store.mode.value)
        store.setMode(AppearanceMode.Dark)
        assertEquals(AppearanceMode.Dark, store.mode.value)
        store.setMode(AppearanceMode.System)
        assertEquals(AppearanceMode.System, store.mode.value)
        assertEquals(listOf("light", "dark", "system"), writes)
    }

    @Test
    fun resolution_uses_the_live_system_value_only_in_system_mode() {
        assertEquals(false, AppearanceMode.Light.resolveDark(true))
        assertEquals(true, AppearanceMode.Dark.resolveDark(false))
        assertEquals(false, AppearanceMode.System.resolveDark(false))
        assertEquals(true, AppearanceMode.System.resolveDark(true))
    }
}
