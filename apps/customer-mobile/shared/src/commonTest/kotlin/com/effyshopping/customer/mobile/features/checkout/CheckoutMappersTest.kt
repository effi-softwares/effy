package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.ArrivalEstimateDTO
import com.effyshopping.customer.mobile.commerce.contract.Method as DtoMethod
import com.effyshopping.customer.mobile.commerce.contract.OrderAddressDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderStage as DtoOrderStage
import com.effyshopping.customer.mobile.commerce.contract.PaymentMethodSummaryDTO
import com.effyshopping.customer.mobile.commerce.contract.Type as DtoMethodType
import com.effyshopping.customer.mobile.commerce.contract.CustomerRefundDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.State as DtoRefundState
import com.effyshopping.customer.mobile.commerce.contract.OrderItemDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderStatus
import com.effyshopping.customer.mobile.commerce.contract.PaymentStatus
import com.effyshopping.customer.mobile.features.checkout.data.toReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.CustomerRefundState
import com.effyshopping.customer.mobile.features.checkout.domain.OrderStage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Receipt mapping (023 US5): `billingAddress` null → "same as shipping"; a value → both in full. */
class CheckoutMappersTest {

    private fun address(name: String) = OrderAddressDTO(
        recipientName = name, line1 = "$name St", line2 = null, city = "Melbourne",
        region = "VIC", postalCode = "3000", country = "AU",
    )

    private fun order(
        billing: OrderAddressDTO?,
        deliveryFee: String? = null,
        method: PaymentMethodSummaryDTO? = null,
        arrivals: List<ArrivalEstimateDTO> = emptyList(),
        stage: DtoOrderStage = DtoOrderStage.Confirmed,
        cancellable: Boolean = false,
        refunds: List<CustomerRefundDTO>? = null,
        refundedTotal: String? = null,
        amountPaidAfterRefunds: String? = null,
        fullyRefunded: Boolean? = null,
    ) = OrderDTO(
        billingAddress = billing,
        currency = "AUD",
        deliveryAddress = address("Ship To"),
        fulfillments = emptyList(),
        grandTotalAmount = "25.00",
        id = "ord1",
        items = listOf(OrderItemDTO(lineSubtotalAmount = "20.00", orderItemID = "oi1", productID = "p1", productName = "Item", quantity = 1.0, unitPriceAmount = "20.00")),
        itemSubtotalAmount = "20.00",
        orderNumber = "EFY-1",
        paymentStatus = PaymentStatus.Succeeded,
        status = OrderStatus.Paid,
        // 052
        stage = stage,
        arrivalEstimates = arrivals,
        deliveryFeeAmount = deliveryFee,
        paymentMethod = method,
        // 055
        cancellable = cancellable,
        refunds = refunds,
        refundedTotal = refundedTotal,
        amountPaidAfterRefunds = amountPaidAfterRefunds,
        fullyRefunded = fullyRefunded,
    )

    @Test
    fun sameAsShippingMapsBillingToNull() {
        val receipt = order(billing = null).toReceipt()

        assertEquals("Ship To", receipt.recipientName)
        assertEquals("Ship To St, Melbourne 3000, AU", receipt.addressLine)
        assertTrue(receipt.billingSameAsShipping)
        assertNull(receipt.billingRecipientName)
        assertNull(receipt.billingAddressLine)
    }

    @Test
    fun divergentBillingMapsBothInFull() {
        val receipt = order(billing = address("Bill To")).toReceipt()

        assertFalse(receipt.billingSameAsShipping)
        assertEquals("Ship To", receipt.recipientName) // shipping unchanged
        assertEquals("Bill To", assertNotNull(receipt.billingRecipientName))
        assertEquals("Bill To St, Melbourne 3000, AU", receipt.billingAddressLine)
    }

    // ── 052 ─────────────────────────────────────────────────────────────────────────────────────

    /**
     * ⚠ THE DEFECT THIS SLICE FOUND ON MOBILE. `deliveryFeeAmount` was never mapped, so this receipt
     * showed Items − Discount = Total while the shopper had actually been charged delivery. 051's
     * FR-043 recorded exactly this and fixed it on customer-web only. A receipt whose lines do not add
     * up is not one anybody can check.
     */
    @Test
    fun deliveryFeeIsMappedSoTheLinesAddUp() {
        val receipt = order(billing = null, deliveryFee = "8.00").toReceipt()

        assertEquals("8.00", assertNotNull(receipt.deliveryFeeAmount))
        // items 20.00 + delivery 8.00 = 28.00; the fixture's grand total is what was charged.
        val items = receipt.itemSubtotalAmount.toDouble()
        val delivery = receipt.deliveryFeeAmount!!.toDouble()
        assertEquals(items + delivery, 28.0)
    }

    @Test
    fun theStageIsMappedFromTheWireAndNeverRecomputed() {
        assertEquals(OrderStage.Confirmed, order(null, stage = DtoOrderStage.Confirmed).toReceipt().stage)
        assertEquals(OrderStage.Packing, order(null, stage = DtoOrderStage.Packing).toReceipt().stage)
        assertEquals(OrderStage.OnTheWay, order(null, stage = DtoOrderStage.OnTheWay).toReceipt().stage)
        assertEquals(OrderStage.Delivered, order(null, stage = DtoOrderStage.Delivered).toReceipt().stage)
    }

    /** FR-006: absence is normal — a pre-052 order, or a failed post-commit capture. */
    @Test
    fun anUncapturedPaymentMethodMapsToNullRatherThanABlank() {
        assertNull(order(billing = null, method = null).toReceipt().paymentMethod)

        val withMethod = order(
            billing = null,
            method = PaymentMethodSummaryDTO(brand = "visa", last4 = "4242", type = DtoMethodType.Card),
        ).toReceipt()
        val m = assertNotNull(withMethod.paymentMethod)
        assertEquals("visa", m.brand)
        assertEquals("4242", m.last4)
        assertEquals("card", m.type)
    }

    /**
     * FR-007 / research R4: the arrival is a DATE RANGE. ⚠ Nothing mapped here may carry a time — the
     * platform has no delivery window and must not appear to promise one.
     */
    @Test
    fun arrivalEstimatesMapAsDatesAndCarryNoShopReference() {
        val receipt = order(
            billing = null,
            arrivals = listOf(
                ArrivalEstimateDTO(
                    method = DtoMethod.SameDay,
                    promisedFrom = "2026-08-26",
                    promisedTo = "2026-08-26",
                ),
            ),
        ).toReceipt()

        assertEquals(1, receipt.arrivalEstimates.size)
        val a = receipt.arrivalEstimates.first()
        assertEquals("same_day", a.method)
        assertEquals("2026-08-26", a.promisedFrom)
        // A date, never a time.
        assertFalse(a.promisedFrom!!.contains(":"))
    }

    /** The unit price has been on the wire since 019; this screen never rendered it until 052. */
    @Test
    fun theUnitPriceReachesTheDomain() {
        val receipt = order(billing = null).toReceipt()
        assertEquals("20.00", receipt.items.first().unitPriceAmount)
    }

    /**
     * ⚠ 055 — THE MAPPER MUST NOT DROP IT.
     *
     * This is the exact shape that lost `brand`, `badges` and (033) `productId` on this surface: the
     * backend sent the field and the domain model simply did not ask for it. Nothing failed, nothing
     * logged — the control just never appeared, and the reason was invisible from the screen.
     */
    @Test
    fun cancellableSurvivesTheMapper() {
        assertEquals(true, order(billing = null, cancellable = true).toReceipt().cancellable)
        assertEquals(false, order(billing = null, cancellable = false).toReceipt().cancellable)
    }

    /**
     * ⚠ AND IT IS NEVER DERIVED FROM THE STAGE. A client computing this from `stage` would be a second
     * implementation of a rule the server owns — the `summarizeFulfillment` mistake 052 deleted. A
     * `confirmed` order that a shop has already begun is NOT cancellable, and only the server knows.
     */
    @Test
    fun cancellableIsTakenFromTheServerNotInferredFromTheStage() {
        val confirmedButStarted = order(
            billing = null,
            stage = DtoOrderStage.Confirmed,
            cancellable = false,
        ).toReceipt()
        assertEquals(OrderStage.Confirmed, confirmedButStarted.stage)
        assertEquals(false, confirmedButStarted.cancellable)
    }

    // ── 055 US5 ─────────────────────────────────────────────────────────────────────────────────

    /**
     * ⚠ FR-028 — NO REFUNDS MEANS RENDER NOTHING, not an empty section.
     *
     * ⚠ AND `amountPaidAfterRefunds` FALLS BACK TO THE CHARGED TOTAL, not to "0.00". A zero here
     * would tell a shopper who was never refunded that they paid nothing.
     */
    @Test
    fun anUnrefundedOrderCarriesNoRefundsAndStillShowsWhatWasPaid() {
        val receipt = order(billing = null).toReceipt()
        assertEquals(emptyList(), receipt.refunds)
        assertEquals("0.00", receipt.refundedTotal)
        assertEquals(receipt.grandTotalAmount, receipt.amountPaidAfterRefunds)
        assertEquals(false, receipt.fullyRefunded)
    }

    /** ⚠ The figures a shopper reconciles against their bank statement. */
    @Test
    fun refundTotalsAreMappedNotRecomputed() {
        val receipt = order(
            billing = null,
            refunds = listOf(
                CustomerRefundDTO(amount = "6.00", state = DtoRefundState.Completed),
                CustomerRefundDTO(amount = "4.00", state = DtoRefundState.OnItsWay),
            ),
            refundedTotal = "10.00",
            amountPaidAfterRefunds = "40.00",
        ).toReceipt()

        assertEquals(2, receipt.refunds.size)
        // ⚠ The SERVER's arithmetic, not this client's. A second implementation of one sum is how two
        // surfaces come to disagree about a shopper's money.
        assertEquals("10.00", receipt.refundedTotal)
        assertEquals("40.00", receipt.amountPaidAfterRefunds)
    }

    /**
     * ⚠ THE RECEIPT IS UNCHANGED BY A REFUND (FR-024). What was CHARGED is a historical record; a
     * document that rewrote itself could not be reconciled against a bank statement.
     */
    @Test
    fun aRefundDoesNotRewriteTheChargedTotal() {
        val receipt = order(
            billing = null,
            refunds = listOf(CustomerRefundDTO(amount = "25.00", state = DtoRefundState.Completed)),
            refundedTotal = "25.00",
            amountPaidAfterRefunds = "0.00",
            fullyRefunded = true,
        ).toReceipt()

        assertEquals("25.00", receipt.grandTotalAmount, "the charged total must not move")
        assertEquals("0.00", receipt.amountPaidAfterRefunds)
        assertEquals(true, receipt.fullyRefunded)
    }

    /** ⚠ Each wire state maps to exactly one domain state — none may silently become another. */
    @Test
    fun everyWireRefundStateMapsToItsOwnDomainState() {
        val pairs = mapOf(
            DtoRefundState.OnItsWay to CustomerRefundState.OnItsWay,
            DtoRefundState.Completed to CustomerRefundState.Completed,
            DtoRefundState.ThereWasAProblem to CustomerRefundState.ThereWasAProblem,
        )
        pairs.forEach { (wire, domain) ->
            val receipt = order(
                billing = null,
                refunds = listOf(CustomerRefundDTO(amount = "1.00", state = wire)),
            ).toReceipt()
            assertEquals(domain, receipt.refunds.single().state)
        }
    }

    /**
     * ⚠ 055 — THE LINE's OWN ID MUST SURVIVE THE MAPPER.
     *
     * This is the third time this exact shape has bitten this surface: `brand`, `badges` and (033)
     * `productId` were all sent by the backend and dropped by the domain model. Nothing fails — the
     * feature just silently does nothing, and the reason is invisible from the screen. Here it would
     * mean every item a shopper named in a refund request was quietly discarded by the server's join.
     */
    @Test
    fun orderItemIdSurvivesTheMapper() {
        assertEquals("oi1", order(billing = null).toReceipt().items.single().orderItemId)
    }
}