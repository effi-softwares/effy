package com.effyshopping.customer.mobile.core.nav

import androidx.compose.runtime.mutableStateOf
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * 087 — the five-tab bar.
 *
 * Two rules: the cart is a TAB (every way into it selects the tab, so it has one back stack and one
 * place in the bar), and tapping the tab you are already in returns it to its root (the iOS
 * convention). Everything else about the per-tab stacks is unchanged and covered by
 * [CustomerNavStateTest].
 */
class TabNavigationTest {

    private fun state(active: CustomerNavKey = CustomerNavKey.Home) = CustomerNavState(
        stacks = CUSTOMER_TAB_ROOTS.associateWith { NavBackStack<NavKey>(it) },
        activeTabState = mutableStateOf(active),
    )

    @Test
    fun `the cart is a tab root, between Search and Orders`() {
        val i = CUSTOMER_TAB_ROOTS.indexOf(CustomerNavKey.Cart)
        assertTrue(i >= 0, "Cart must be a tab root")
        assertEquals(CustomerNavKey.Search, CUSTOMER_TAB_ROOTS[i - 1])
        assertEquals(CustomerNavKey.Orders, CUSTOMER_TAB_ROOTS[i + 1])
    }

    @Test
    fun `opening the cart from a product keeps the product where the shopper left it`() {
        val nav = state(active = CustomerNavKey.Home)
        nav.push(CustomerNavKey.Product("p1"))

        nav.selectTab(CustomerNavKey.Cart)
        assertEquals(CustomerNavKey.Cart, nav.current)
        assertTrue(nav.showBottomBar, "the cart tab's root shows the bar")

        nav.selectTab(CustomerNavKey.Home)
        assertEquals(CustomerNavKey.Product("p1"), nav.current, "Home's history survives the trip to the cart")
    }

    @Test
    fun `tapping the active tab returns it to its root`() {
        val nav = state(active = CustomerNavKey.Cart)
        nav.push(CustomerNavKey.Checkout)
        assertFalse(nav.showBottomBar)

        nav.tapTab(CustomerNavKey.Cart)

        assertEquals(listOf<NavKey>(CustomerNavKey.Cart), nav.currentStack.toList())
        assertTrue(nav.showBottomBar)
    }

    @Test
    fun `tapping another tab switches without touching either stack`() {
        val nav = state(active = CustomerNavKey.Home)
        nav.push(CustomerNavKey.Product("p1"))

        nav.tapTab(CustomerNavKey.Orders)
        assertEquals(CustomerNavKey.Orders, nav.activeTab)

        nav.tapTab(CustomerNavKey.Home)
        assertEquals(CustomerNavKey.Product("p1"), nav.current, "switching tabs is not a reset")
    }
}
