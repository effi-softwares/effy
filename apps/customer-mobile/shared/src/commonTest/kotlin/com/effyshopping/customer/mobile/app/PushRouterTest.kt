package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.push.CustomerDestination
import kotlin.test.Test
import kotlin.test.assertEquals

/** Where each kind of destination opens (109 FR-011, FR-013, FR-016): on its tab's root, then the screen on top. */
class PushRouterTest {

    private fun opens(vararg steps: PushNavStep) = steps.toList()

    @Test
    fun anOrderOpensThatOrderUnderOrders() {
        assertEquals(
            opens(PushNavStep.SelectTab(CustomerNavKey.Orders), PushNavStep.ResetToRoot, PushNavStep.Push(CustomerNavKey.OrderDetail("o1"))),
            pushNavSteps(CustomerDestination.Order("o1")),
        )
    }

    @Test
    fun pointsOpenUnderAccount() {
        assertEquals(
            opens(PushNavStep.SelectTab(CustomerNavKey.Account), PushNavStep.ResetToRoot, PushNavStep.Push(CustomerNavKey.Points)),
            pushNavSteps(CustomerDestination.Points),
        )
    }

    @Test
    fun theOrdersListAndHomeOpenTheirTabRoots() {
        assertEquals(opens(PushNavStep.SelectTab(CustomerNavKey.Orders), PushNavStep.ResetToRoot), pushNavSteps(CustomerDestination.Orders))
        assertEquals(opens(PushNavStep.SelectTab(CustomerNavKey.Home), PushNavStep.ResetToRoot), pushNavSteps(CustomerDestination.Home))
    }

    @Test
    fun anUnknownDestinationOpensHome() {
        assertEquals(opens(PushNavStep.SelectTab(CustomerNavKey.Home), PushNavStep.ResetToRoot), pushNavSteps(null))
    }

    @Test
    fun shopDestinationsOpenTheScreensABannerWouldOpen() {
        assertEquals(PushNavStep.Push(CustomerNavKey.Product("p1")), pushNavSteps(CustomerDestination.Product("p1", "dairy")).last())
        assertEquals(
            PushNavStep.Push(CustomerNavKey.Results(title = "Dairy", categoryKey = "dairy")),
            pushNavSteps(CustomerDestination.Aisle("dairy", "Dairy")).last(),
        )
        assertEquals(PushNavStep.Push(CustomerNavKey.Results(title = SALE_TITLE, saleOnly = true)), pushNavSteps(CustomerDestination.Sale).last())
        assertEquals(opens(PushNavStep.SelectTab(CustomerNavKey.Search), PushNavStep.ResetToRoot), pushNavSteps(CustomerDestination.Search("milk")))
    }
}
