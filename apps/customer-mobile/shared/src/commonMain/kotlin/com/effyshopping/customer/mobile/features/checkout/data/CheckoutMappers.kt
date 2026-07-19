package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.commerce.contract.AddressDTO
import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentResponse
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.features.checkout.domain.Address
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import com.effyshopping.customer.mobile.features.checkout.domain.ReceiptItem

internal fun CreateCheckoutIntentResponse.toDomain(): CheckoutIntent = CheckoutIntent(
    orderId = orderID,
    orderNumber = orderNumber,
    clientSecret = clientSecret,
    publishableKey = publishableKey,
    grandTotalAmount = grandTotalAmount,
    currency = currency,
)

internal fun com.effyshopping.customer.mobile.commerce.contract.OrderSummaryDTO.toDomain() =
    com.effyshopping.customer.mobile.features.checkout.domain.OrderSummary(
        id = id,
        orderNumber = orderNumber,
        status = status.value,
        itemCount = itemCount.toInt(),
        grandTotalAmount = grandTotalAmount,
        currency = currency,
    )

internal fun AddressDTO.toDomain(): Address = Address(
    id = id,
    recipientName = recipientName,
    line1 = line1,
    line2 = line2,
    city = city,
    region = region,
    postalCode = postalCode,
    country = country,
    isDefault = isDefault,
)

internal fun OrderDTO.toReceipt(): Receipt {
    val addr = deliveryAddress
    val addressLine = buildString {
        append(addr.line1)
        addr.line2?.let { append(", ").append(it) }
        append(", ").append(addr.city).append(" ").append(addr.postalCode)
        append(", ").append(addr.country)
    }
    return Receipt(
        id = id,
        orderNumber = orderNumber,
        paid = paymentStatus.value == "succeeded" || status.value == "paid",
        items = items.map {
            ReceiptItem(
                productName = it.productName,
                quantity = it.quantity.toInt(),
                unitPriceAmount = it.unitPriceAmount,
                lineSubtotalAmount = it.lineSubtotalAmount,
            )
        },
        recipientName = addr.recipientName,
        addressLine = addressLine,
        itemSubtotalAmount = itemSubtotalAmount,
        deliveryFeeAmount = deliveryFeeAmount,
        grandTotalAmount = grandTotalAmount,
        currency = currency,
    )
}
