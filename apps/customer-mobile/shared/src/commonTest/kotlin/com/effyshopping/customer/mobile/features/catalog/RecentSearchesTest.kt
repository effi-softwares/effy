package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.core.storage.InMemoryDevicePreferences
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.core.storage.clearGuestData
import com.effyshopping.customer.mobile.features.catalog.data.DeviceRecentSearchRepository
import com.effyshopping.customer.mobile.features.catalog.domain.RECENT_SEARCH_LIMIT
import com.effyshopping.customer.mobile.features.catalog.domain.RecentSearch
import com.effyshopping.customer.mobile.features.catalog.domain.withRecentSearch
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 087 FR-036 — recent searches: newest first, no duplicates, ten at most, gone on sign-out. */
class RecentSearchesTest {

    @Test
    fun `newest first, and a repeat moves to the top instead of appearing twice`() {
        var list = emptyList<RecentSearch>()
        list = withRecentSearch(list, "milk", 1)
        list = withRecentSearch(list, "bread", 2)
        list = withRecentSearch(list, "MILK", 3)
        assertEquals(listOf("MILK", "bread"), list.map { it.text })
    }

    @Test
    fun `blank is ignored and the oldest falls off past the limit`() {
        var list = emptyList<RecentSearch>()
        list = withRecentSearch(list, "   ", 0)
        assertTrue(list.isEmpty())
        repeat(RECENT_SEARCH_LIMIT + 3) { list = withRecentSearch(list, "q$it", it.toLong()) }
        assertEquals(RECENT_SEARCH_LIMIT, list.size)
        assertEquals("q${RECENT_SEARCH_LIMIT + 2}", list.first().text)
    }

    @Test
    fun `kept on the device, and cleared with the rest on sign-out`() {
        val prefs = InMemoryDevicePreferences()
        val repo = DeviceRecentSearchRepository(prefs)
        repo.record("oat milk", 1)
        assertEquals(listOf("oat milk"), DeviceRecentSearchRepository(prefs).searches.value.map { it.text }, "survives a restart")

        prefs.clearGuestData()
        repo.reload()

        assertNull(prefs.getString(PreferenceKeys.RECENT_SEARCHES))
        assertTrue(repo.searches.value.isEmpty())
    }

    @Test
    fun `unreadable data reads as no recent searches`() {
        val prefs = InMemoryDevicePreferences()
        prefs.putString(PreferenceKeys.RECENT_SEARCHES, "not json")
        assertTrue(DeviceRecentSearchRepository(prefs).searches.value.isEmpty())
    }
}
