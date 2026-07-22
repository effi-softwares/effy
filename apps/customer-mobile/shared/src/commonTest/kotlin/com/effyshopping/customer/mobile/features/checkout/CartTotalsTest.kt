package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.computeTotals
import com.effyshopping.customer.mobile.features.cart.domain.formatCents
import com.effyshopping.customer.mobile.features.cart.domain.parseCents
import kotlin.test.Test
import kotlin.test.assertEquals

class CartTotalsTest {

    private fun line(unit: String, qty: Int) =
        GuestCartLine("p$unit$qty", "x", null, unit, "AUD", qty)

    @Test
    fun centsRoundTrip() {
        assertEquals(500L, parseCents("5.00"))
        assertEquals(1250L, parseCents("12.5"))
        assertEquals("5.00", formatCents(500))
        assertEquals("0.99", formatCents(99))
    }

    @Test
    fun sumsLinesItemSubtotalOnly() {
        // 021: the flat delivery fee is gone (FR-024) — the cart shows the item subtotal only.
        val totals = computeTotals(listOf(line("5.00", 2), line("3.00", 1)))
        assertEquals("13.00", totals.itemSubtotal)
    }

    @Test
    fun emptyCartHasZeroSubtotal() {
        assertEquals("0.00", computeTotals(emptyList()).itemSubtotal)
    }
}
