package com.effyshopping.shop.mobile.features.shop.presentation

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

class ShopShellStateTest {
    private fun stacks() = TabBackStacks(
        tabs = ShopTab.entries.toList(),
        initialTab = ShopTab.HOME,
        startRoute = ::shopStartRoute,
        initialStacks = ShopTab.entries.associateWith { listOf(shopStartRoute(it)) },
    )

    @Test
    fun nested_back_then_home_fallback_is_predictable() {
        val state = stacks()
        state.push(ManagerArea)
        assertTrue(state.pop())
        assertEquals(HomeRoot, state.currentRoute)
        assertFalse(state.pop())

        state.selectTab(ShopTab.ACCOUNT)
        assertEquals(AccountRoot, state.currentRoute)
        state.selectTab(ShopTab.HOME)
        assertEquals(HomeRoot, state.currentRoute)
    }

    @Test
    fun switching_retains_history_and_reselection_returns_to_root() {
        val state = stacks()
        state.push(ManagerArea)
        state.selectTab(ShopTab.ACCOUNT)
        state.selectTab(ShopTab.HOME)
        assertEquals(ManagerArea, state.currentRoute)
        state.selectTab(ShopTab.HOME)
        assertEquals(HomeRoot, state.currentRoute)
    }

    @Test
    fun rapid_taps_never_corrupt_the_selected_root() {
        val state = stacks()
        repeat(20) {
            state.selectTab(ShopTab.CATALOG)
            state.selectTab(ShopTab.ORDERS)
            state.selectTab(ShopTab.ACCOUNT)
        }
        assertEquals(ShopTab.ACCOUNT, state.currentTab)
        assertEquals(AccountRoot, state.currentRoute)
    }

    @Test
    fun sign_out_reset_clears_every_stack_before_leaving() {
        val state = stacks()
        state.push(ManagerArea)
        state.selectTab(ShopTab.ACCOUNT)
        state.resetForSignOut(ShopTab.HOME)
        assertEquals(ShopTab.HOME, state.currentTab)
        assertEquals(HomeRoot, state.currentRoute)
        ShopTab.entries.forEach { tab ->
            state.selectTab(tab)
            assertEquals(shopStartRoute(tab), state.currentRoute)
        }
    }
}
