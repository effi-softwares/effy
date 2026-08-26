package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.ArrivalEstimateDTO
import com.effyshopping.customer.mobile.commerce.contract.Method as DtoMethod
import com.effyshopping.customer.mobile.commerce.contract.OrderAddressDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderStage as DtoOrderStage
import com.effyshopping.customer.mobile.commerce.contract.PaymentMethodSummaryDTO
import com.effyshopping.customer.mobile.commerce.contract.Type as DtoMethodType
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderItemDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderStatus
import com.effyshopping.customer.mobile.commerce.contract.PaymentStatus
import com.effyshopping.customer.mobile.features.checkout.data.toReceipt
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
    ) = OrderDTO(
        billingAddress = billing,
        currency = "AUD",
        deliveryAddress = address("Ship To"),
        fulfillments = emptyList(),
        grandTotalAmount = "25.00",
        id = "ord1",
        items = listOf(OrderItemDTO(lineSubtotalAmount = "20.00", productID = "p1", productName = "Item", quantity = 1.0, unitPriceAmount = "20.00")),
        itemSubtotalAmount = "20.00",
        orderNumber = "EFY-1",
        paymentStatus = PaymentStatus.Succeeded,
        status = OrderStatus.Paid,
        // 052
        stage = stage,
        arrivalEstimates = arrivals,
        deliveryFeeAmount = deliveryFee,
        paymentMethod = method,
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
}
