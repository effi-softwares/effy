package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.checkout.domain.CustomerRefundState
import com.effyshopping.customer.mobile.features.checkout.presentation.refundStateLabel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * What a shopper is told about a refund on mobile (055 US5, T061) — at parity with customer-web's
 * `RefundBlock.test.tsx`.
 */
class RefundViewTest {

    /**
     * ⚠ T059 / SC-009 — NO PROVIDER FAILURE REASON MAY REACH A CUSTOMER. "Your bank rejected the
     * refund" is staff information: a shopper cannot act on it, and surfacing it invites them to
     * argue with a message that will not change.
     */
    @Test
    fun noRefundLabelLeaksTheProvidersReasonOrAShop() {
        val banned = listOf("declin", "reject", "bank rejected", "shop", "stripe", "provider", "card_")
        CustomerRefundState.entries.forEach { state ->
            val label = refundStateLabel(state).lowercase()
            banned.forEach { leak ->
                assertFalse(label.contains(leak), "\"$label\" leaks \"$leak\"")
            }
        }
    }

    /**
     * ⚠ ONLY `Completed` MAY SAY THE MONEY ARRIVED. Everything else is a claim about the future, and
     * telling a shopper their refund is done is precisely what stops them looking for it.
     */
    @Test
    fun onlyCompletedSaysTheMoneyArrived() {
        assertEquals("Refunded", refundStateLabel(CustomerRefundState.Completed))
        assertTrue(refundStateLabel(CustomerRefundState.OnItsWay).contains("on its way", ignoreCase = true))
        assertTrue(
            refundStateLabel(CustomerRefundState.ThereWasAProblem).contains("problem", ignoreCase = true),
        )
    }

    /** ⚠ Every state must have a label — an unhandled one would render nothing at all. */
    @Test
    fun everyStateHasALabel() {
        CustomerRefundState.entries.forEach { state ->
            assertTrue(refundStateLabel(state).isNotBlank(), "$state has no label")
        }
        assertEquals(3, CustomerRefundState.entries.size, "the customer vocabulary is three states")
    }
}
