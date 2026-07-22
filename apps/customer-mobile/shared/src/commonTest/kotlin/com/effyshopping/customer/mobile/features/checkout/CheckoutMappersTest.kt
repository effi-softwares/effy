package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.commerce.contract.OrderAddressDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderItemDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderStatus
import com.effyshopping.customer.mobile.commerce.contract.PaymentStatus
import com.effyshopping.customer.mobile.features.checkout.data.toReceipt
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

    private fun order(billing: OrderAddressDTO?) = OrderDTO(
        billingAddress = billing,
        currency = "AUD",
        deliveryAddress = address("Ship To"),
        deliveryFeeAmount = "5.00",
        fulfillments = emptyList(),
        grandTotalAmount = "25.00",
        id = "ord1",
        items = listOf(OrderItemDTO(lineSubtotalAmount = "20.00", productID = "p1", productName = "Item", quantity = 1.0, unitPriceAmount = "20.00")),
        itemSubtotalAmount = "20.00",
        orderNumber = "EFY-1",
        paymentStatus = PaymentStatus.Succeeded,
        status = OrderStatus.Paid,
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
}
