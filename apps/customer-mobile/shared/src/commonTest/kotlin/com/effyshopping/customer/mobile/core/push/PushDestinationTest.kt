package com.effyshopping.customer.mobile.core.push

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Where a tapped notification goes. The links are the notifications worker's (`deepLinkFor` in
 * apis/edge-api/notifications/src/worker/copy.ts): `effy://<deepLinkPath>/<entityId>`, or the bare
 * `effy://<deepLinkPath>` when the entity is not something the app can open (`entityInLink: false`).
 */
class PushDestinationTest {

    @Test
    fun anOrdersOwnEventOpensThatOrder() {
        // order_paid, order_ready, order_delivered: the entity is the order.
        assertEquals(PushDestination.Order("7b1c"), pushDestination("effy://order/7b1c"))
    }

    @Test
    fun anOrderLinkWithoutAnIdOpensTheOrdersTab() {
        // order_with_courier (a consignment id) and order_delivery_changed (an override id): the server
        // leaves the id out, so neither can ever be opened as if it were an order.
        assertEquals(PushDestination.Orders, pushDestination("effy://order"))
        assertEquals(PushDestination.Orders, pushDestination("effy://order/"))
    }

    @Test
    fun pointsOpenPoints() {
        assertEquals(PushDestination.Points, pushDestination("effy://points"))
    }

    @Test
    fun aLinkTheAppHasNoScreenForJustOpensTheApp() {
        assertNull(pushDestination(null))
        assertNull(pushDestination(""))
        assertNull(pushDestination("effy://run/9"))      // a driver's link
        assertNull(pushDestination("effy://queue"))      // a shop's link
        assertNull(pushDestination("https://effyshopping.com/order/7b1c"))
        assertNull(pushDestination("order/7b1c"))
    }
}
