package com.effyshopping.customer.mobile.features.checkout.presentation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

/** The receipt prints values, never template text: every sentence is rendered and any `${` left fails. */
class ReceiptTextTest {

    private fun assertNoTemplate(s: String) = assertFalse("\${" in s || "\$it" in s, "template text leaked: $s")

    @Test
    fun `the order title carries the number`() {
        val s = ReceiptText.orderTitle("EF-20481")
        assertEquals("Order EF-20481", s)
        assertNoTemplate(s)
    }

    @Test
    fun `a discount names its code, or says Discount`() {
        assertEquals("Discount (FRESH10)", ReceiptText.discountLabel("FRESH10"))
        assertEquals("Discount", ReceiptText.discountLabel(null))
    }

    @Test
    fun `a card is its brand and last four`() {
        assertEquals("Visa ending 4242", ReceiptText.cardLabel("Visa", "4242"))
        assertEquals("Klarna", ReceiptText.cardLabel("Klarna", null))
    }

    @Test
    fun `a cancellation states the amount with its currency`() {
        val s = ReceiptText.cancelled("34.50", "AUD")
        assertEquals("Your order is cancelled. \$34.50 is on its way back to you.", s)
        assertNoTemplate(s)
    }
}
