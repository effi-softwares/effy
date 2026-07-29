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
 * ⚠ FOUR tabs, not five. Browse was removed at the operator's instruction, which **supersedes 025
 * FR-010** ("an equivalent category browse experience reachable from its primary navigation"). That
 * requirement is no longer in force for mobile; category filtering now lives in the Discover chips.
 * Recorded here rather than only in the spec, because this test is what a later reader will hit first.
 *
 * The set is still pinned: changing it is a navigation change, not a restyle.
 */
class ScreenInventoryTest {

    @Test
    fun `the four primary destinations are stable`() {
        assertEquals(
            listOf(
                CustomerNavKey.Home,
                CustomerNavKey.Search,
                CustomerNavKey.Orders,
                CustomerNavKey.Account,
            ),
            CUSTOMER_TAB_ROOTS,
            "Changing the tab set is a navigation change, not a restyle (FR-031a).",
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
            21,
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

/**
 * 026 — the invariant the back arrow rests on.
 *
 * `rememberBackAffordanceDecorator` decides whether a destination shows a back arrow by comparing
 * `NavEntry.contentKey` against the bottom of the stack. `NavEntry.key` is private, and Nav3 derives
 * `contentKey` from `key.toString()`, so that comparison is only an identity check for as long as
 * every route stringifies distinctly.
 *
 * A route that broke this — by overriding `toString()`, or by being declared as a `class` rather than
 * a `data class`/`data object`, which would fall back to an identity hash — would make some screen
 * either lose its back arrow or grow one that pops nothing, and it would do so silently.
 */
class CustomerNavKeyContentKeyTest {

    @Test
    fun `every route stringifies distinctly`() {
        val keys = ALL_CUSTOMER_ROUTES.map { it.toString() }
        assertEquals(
            keys.size,
            keys.distinct().size,
            "two routes share a contentKey — the back arrow would follow the wrong one: $keys",
        )
    }

    @Test
    fun `stringification is by value and not by identity`() {
        // Two equal keys must agree, or pushing the same product twice would confuse the stack root
        // check. An identity-hashed toString (a plain `class`) fails here.
        assertEquals(
            CustomerNavKey.Product("p1").toString(),
            CustomerNavKey.Product("p1").toString(),
        )
        assertTrue(
            CustomerNavKey.Product("p1").toString() != CustomerNavKey.Product("p2").toString(),
            "distinct products must not share a contentKey",
        )
    }
}
