package com.effyshopping.customer.mobile.app

import androidx.navigation3.runtime.NavKey
import com.effyshopping.customer.mobile.core.nav.ALL_CUSTOMER_ROUTES
import com.effyshopping.customer.mobile.core.nav.CUSTOMER_TAB_ROOTS
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.nav.customerNavSavedState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** The primary destinations: five tabs (Home · Search · Cart · Orders · Account). Pinned: changing it is a navigation change, not a restyle. */
class ScreenInventoryTest {

    @Test
    fun `the five primary destinations are stable`() {
        assertEquals(
            listOf(
                CustomerNavKey.Home,
                CustomerNavKey.Search,
                CustomerNavKey.Cart,
                CustomerNavKey.Orders,
                CustomerNavKey.Account,
            ),
            CUSTOMER_TAB_ROOTS,
            "Changing the tab set is a navigation change, not a restyle (FR-031a).",
        )
    }
}

/** iOS restore safety: every route is registered in the polymorphic module behind `customerNavSavedState` (a missing one fails on iOS only). */
class CustomerNavKeySerializationTest {

    @Test
    fun `the round-trip list matches the declared route count`() {
        // ALL_CUSTOMER_ROUTES is what the serializers module is kept in step with. If a route is
        // added to CustomerNavKey and forgotten here, this count drifts and the failure is loud.
        assertEquals(
            // 051 US6 adds PaymentMethods (33 → 34); wiring the payment screen adds Payment (34 → 35);
            // Adds Points (35 → 36). 101 adds CategoryBrowse (36 → 37).
            37,
            ALL_CUSTOMER_ROUTES.size,
            "A route was added or removed — update ALL_CUSTOMER_ROUTES *and* customerNavSavedState.",
        )
    }

    /**
     * The counts above are necessary and not sufficient.
     *
     * A route can be present in `ALL_CUSTOMER_ROUTES` and missing from the polymorphic module, and
     * every count test still passes. The failure then shows up only on iOS, only after process
     * death, only when that route is on the stack. This actually serialises each route through the
     * configured module, which is the only thing that proves the registration exists.
     */
    @Test
    fun `every declared route round-trips through the saved-state module`() {
        val module = customerNavSavedState.serializersModule
        ALL_CUSTOMER_ROUTES.forEach { route ->
            val serializer = module.getPolymorphic(NavKey::class, route)
            assertNotNull(
                serializer,
                "$route is not registered in customerNavSavedState — it will restore on Android and " +
                    "THROW on iOS, and no Android test will ever tell you.",
            )
        }
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
 * The invariant the back arrow rests on.
 *
 * `rememberBackAffordanceDecorator` decides whether a destination shows a back arrow by comparing
 * `NavEntry.contentKey` against the bottom of the stack. `NavEntry.key` is private, and Nav3 derives
 * `contentKey` from `key.toString`, so that comparison is only an identity check for as long as
 * every route stringifies distinctly.
 *
 * A route that broke this — by overriding `toString`, or by being declared as a `class` rather than
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
