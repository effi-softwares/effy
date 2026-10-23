package com.effyshopping.customer.mobile.core.nav

import androidx.compose.runtime.mutableStateOf
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The per-tab back stacks. Much of this pins one rule: completing sign-in must never `resetTo(Home)` from
 * inside another tab, which would set that tab's stack to Home for good.
 */
class CustomerNavStateTest {

    private fun state(active: CustomerNavKey = CustomerNavKey.Home) = CustomerNavState(
        stacks = CUSTOMER_TAB_ROOTS.associateWith { NavBackStack<NavKey>(it) },
        activeTabState = mutableStateOf(active),
    )

    @Test
    fun `resetToRoot returns the ACTIVE tab to its own root and never to Home`() {
        val nav = state(active = CustomerNavKey.Account)
        nav.push(CustomerNavKey.SignIn())
        nav.push(CustomerNavKey.VerifyOtp("a@b.c", OtpPurpose.SIGN_IN))

        nav.resetToRoot()

        // The exact assertion the shipped bug would fail: Account, not Home.
        assertEquals(listOf<NavKey>(CustomerNavKey.Account), nav.currentStack.toList())
        assertEquals(CustomerNavKey.Account, nav.current)
    }

    @Test
    fun `resetTo refuses to plant another tabs root in this tab`() {
        val nav = state(active = CustomerNavKey.Account)
        val failure = assertFailsWith<IllegalArgumentException> {
            nav.resetTo(CustomerNavKey.Home)
        }
        // The message must name both tabs — a bare "illegal argument" would not have helped anyone.
        assertTrue("Home" in failure.message.orEmpty() && "Account" in failure.message.orEmpty())
    }

    @Test
    fun `resetTo still allows a non-root destination`() {
        val nav = state(active = CustomerNavKey.Home)
        nav.push(CustomerNavKey.Product("p1"))
        nav.resetTo(CustomerNavKey.Receipt("o1"))
        assertEquals(listOf<NavKey>(CustomerNavKey.Receipt("o1")), nav.currentStack.toList())
    }

    @Test
    fun `each tab keeps its own stack`() {
        val nav = state(active = CustomerNavKey.Home)
        nav.push(CustomerNavKey.Product("p1"))

        nav.selectTab(CustomerNavKey.Search)
        assertEquals(listOf<NavKey>(CustomerNavKey.Search), nav.currentStack.toList())

        nav.selectTab(CustomerNavKey.Home)
        assertEquals(CustomerNavKey.Product("p1"), nav.current)
    }

    @Test
    fun `the bottom bar shows at a tab root and hides above it`() {
        val nav = state()
        assertTrue(nav.showBottomBar)
        assertFalse(nav.canGoBack)

        nav.push(CustomerNavKey.Product("p1"))
        assertFalse(nav.showBottomBar)
        assertTrue(nav.canGoBack)

        assertTrue(nav.pop())
        assertTrue(nav.showBottomBar)
    }

    @Test
    fun `pop at a tab root does nothing and says so`() {
        val nav = state()
        assertFalse(nav.pop(), "the caller decides what back means at a root; it must not empty the stack")
        assertEquals(1, nav.currentStack.size)
    }

    // The search-focus one-shot

    @Test
    fun `no focus is pending until it is asked for`() {
        val nav = state()
        assertFalse(
            nav.consumeSearchFocus(),
            "reaching the Search tab from the bottom bar must not throw the keyboard over the results",
        )
    }

    @Test
    fun `a requested focus is delivered exactly once`() {
        val nav = state()
        nav.requestSearchFocus()

        assertTrue(nav.consumeSearchFocus(), "the tap on Home's search entry must reach a live keyboard")
        assertFalse(
            nav.consumeSearchFocus(),
            "one-shot: without this the keyboard reappears on every recomposition and on every later " +
                "visit to the Search tab, whether or not the shopper asked",
        )
    }

    @Test
    fun `repeated requests still deliver only one focus each time`() {
        val nav = state()
        nav.requestSearchFocus()
        nav.requestSearchFocus()

        assertTrue(nav.consumeSearchFocus())
        assertFalse(nav.consumeSearchFocus(), "two taps before a consume are still one pending request")
    }
}
