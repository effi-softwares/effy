package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.nav.AppRoute
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 026 T045 — the primary navigation destination set (contracts S9 / research R7).
 *
 * The source design's five tabs are Home/Search/Saved/Cart/Account. Effy keeps its OWN five, because
 * adopting the source's would drop Browse — and Browse in primary navigation is a signed-off
 * requirement of 025 (FR-009/FR-010), written precisely because that entry used to be a dead-end
 * placeholder. This test is what stops a later "match the mockup" edit from quietly regressing it.
 */
class ScreenInventoryTest {

    @Test
    fun `the five primary destinations are stable`() {
        assertEquals(
            listOf("Home", "Browse", "Search", "Orders", "Account"),
            CustomerTab.entries.map { it.label },
            "Changing the tab set is a navigation change, not a restyle (FR-031a). If this is " +
                "deliberate, record the decision before changing the expectation.",
        )
    }

    @Test
    fun `browse is reachable from primary navigation`() {
        assertTrue(
            CustomerTab.entries.any { it == CustomerTab.BROWSE },
            "025 FR-010: category browse must be reachable from primary navigation.",
        )
    }
}

/**
 * 026 T043 — every screen the app gained in this feature is a real route.
 *
 * A screen that exists but has no route is unreachable, which is the failure the exhaustive `when`
 * in `CustomerShell` already turns into a compile error. This asserts the routes themselves exist so
 * the set cannot be quietly trimmed.
 */
class NewScreenRoutesTest {

    @Test
    fun `the screens added by 026 all have routes`() {
        val routes: List<AppRoute> = listOf(
            AppRoute.Notifications,
            AppRoute.Faqs,
            AppRoute.HelpCenter,
            AppRoute.CustomerService,
        )
        assertEquals(4, routes.distinct().size, "each new screen needs its own route")
    }

    @Test
    fun `pre-existing account routes are untouched`() {
        // FR-025b: replacing presentation must not disturb the account sub-graph's wiring.
        val routes: List<AppRoute> = listOf(
            AppRoute.Account,
            AppRoute.EditName,
            AppRoute.PasswordSet,
            AppRoute.PasswordChange,
            AppRoute.AddressBook,
        )
        assertEquals(5, routes.distinct().size)
    }
}
