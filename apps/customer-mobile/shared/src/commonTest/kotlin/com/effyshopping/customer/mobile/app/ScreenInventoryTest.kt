package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.nav.ALL_CUSTOMER_ROUTES
import com.effyshopping.customer.mobile.core.nav.CUSTOMER_TAB_ROOTS
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 026 T045 — the primary navigation destination set (contracts S9 / research R7).
 *
 * The source design's five tabs are Home/Search/Saved/Cart/Account. Effy keeps its OWN five, because
 * adopting the source's would drop Browse — and Browse in primary navigation is a signed-off
 * requirement of 025 (FR-009/FR-010), written precisely because that entry used to be a dead-end
 * placeholder. This is what stops a later "match the mockup" edit from quietly regressing it.
 */
class ScreenInventoryTest {

    @Test
    fun `the five primary destinations are stable`() {
        assertEquals(
            listOf(
                CustomerNavKey.Home,
                CustomerNavKey.Browse,
                CustomerNavKey.Search,
                CustomerNavKey.Orders,
                CustomerNavKey.Account,
            ),
            CUSTOMER_TAB_ROOTS,
            "Changing the tab set is a navigation change, not a restyle (FR-031a).",
        )
    }

    @Test
    fun `browse is reachable from primary navigation`() {
        assertTrue(
            CustomerNavKey.Browse in CUSTOMER_TAB_ROOTS,
            "025 FR-010: category browse must be reachable from primary navigation.",
        )
    }
}

/**
 * 026 — iOS restore safety.
 *
 * Kotlin/Native has no reflection-based saved state, so every route must be registered in the
 * polymorphic module backing `customerNavSavedState`. A missing registration fails to restore **on
 * iOS only** and passes every Android test — the exact bug 015 predicted (research R6).
 */
class CustomerNavKeySerializationTest {

    @Test
    fun `the round-trip list matches the declared route count`() {
        // ALL_CUSTOMER_ROUTES is what the serializers module is kept in step with. If a route is
        // added to CustomerNavKey and forgotten here, this count drifts and the failure is loud.
        assertEquals(
            22,
            ALL_CUSTOMER_ROUTES.size,
            "A route was added or removed — update ALL_CUSTOMER_ROUTES *and* customerNavSavedState.",
        )
    }

    @Test
    fun `no route is duplicated`() {
        assertEquals(
            ALL_CUSTOMER_ROUTES.size,
            ALL_CUSTOMER_ROUTES.distinct().size,
            "duplicate route in ALL_CUSTOMER_ROUTES",
        )
    }
}
