package com.effyshopping.mobile.kit

import com.effyshopping.mobile.kit.nav.TabBackStacks
import com.effyshopping.shop.mobile.core.nav.AccountRoot
import com.effyshopping.shop.mobile.core.nav.HomeRoot
import com.effyshopping.shop.mobile.core.nav.ManagerArea
import com.effyshopping.shop.mobile.core.nav.ShopTab
import com.effyshopping.shop.mobile.core.nav.shopStartRoute
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * 015 T011 / contract §7 — per-tab back-stack semantics (FR-003/004/005). Uses the shop app's real
 * routes/tabs (the first consumer of the shared `mobile-kit`).
 */
class TabBackStacksTest {

    private fun newStacks() = TabBackStacks(
        tabs = ShopTab.entries.toList(),
        initialTab = ShopTab.HOME,
        startRoute = ::shopStartRoute,
        initialStacks = ShopTab.entries.associateWith { listOf(shopStartRoute(it)) },
    )

    @Test
    fun starts_at_home_root() {
        val s = newStacks()
        assertEquals(ShopTab.HOME, s.currentTab)
        assertEquals(HomeRoot, s.currentRoute)
        assertFalse(s.canGoBack)
    }

    @Test
    fun push_then_pop_within_a_tab() {
        val s = newStacks()
        s.push(ManagerArea)
        assertTrue(s.canGoBack)
        assertEquals(ManagerArea, s.currentRoute)
        assertTrue(s.pop())
        assertEquals(HomeRoot, s.currentRoute)
        assertFalse(s.pop()) // at root
    }

    @Test
    fun switching_tabs_preserves_each_tabs_history() {
        val s = newStacks()
        s.push(ManagerArea)                 // deep in Home
        s.selectTab(ShopTab.ACCOUNT)
        assertEquals(AccountRoot, s.currentRoute)
        s.selectTab(ShopTab.HOME)
        assertEquals(ManagerArea, s.currentRoute) // Home history preserved
    }

    @Test
    fun re_selecting_active_tab_pops_to_root() {
        val s = newStacks()
        s.push(ManagerArea)
        s.selectTab(ShopTab.HOME) // same tab → pop to root
        assertEquals(HomeRoot, s.currentRoute)
        assertFalse(s.canGoBack)
    }

    @Test
    fun reset_for_signout_clears_all_and_returns_home() {
        val s = newStacks()
        s.push(ManagerArea)
        s.selectTab(ShopTab.ACCOUNT)
        s.resetForSignOut(ShopTab.HOME)
        assertEquals(ShopTab.HOME, s.currentTab)
        assertEquals(HomeRoot, s.currentRoute)
        s.selectTab(ShopTab.HOME) // pops to root (already root) — still Home
        assertEquals(HomeRoot, s.currentRoute)
    }
}
