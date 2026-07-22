package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.commerce.contract.CheckoutDeliveryMethod
import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentRequest
import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentResponse
import com.effyshopping.customer.mobile.commerce.contract.DeliveryMethodOptionDTO
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteResponse
import com.effyshopping.customer.mobile.commerce.contract.DeliverySelectionDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderAddressDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.QuotePackageDTO
import com.effyshopping.customer.mobile.commerce.contract.QuotePackageItemDTO
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryOption
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.DeliverySelection
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.QuotePackage
import com.effyshopping.customer.mobile.features.checkout.domain.QuotePackageItem
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import com.effyshopping.customer.mobile.features.checkout.domain.ReceiptItem

// ── Delivery quote (021) ────────────────────────────────────────────────────────────────────────────
// DTO → domain: `quantity` is a codegen Double narrowed to Int (contract note); DTOs never escape here.

internal fun DeliveryQuoteResponse.toDomain(): DeliveryQuote = DeliveryQuote(
    quoteId = quoteID,
    expiresAt = expiresAt,
    packages = packages.map { it.toDomain() },
)

private fun QuotePackageDTO.toDomain(): QuotePackage = QuotePackage(
    packageKey = packageKey,
    items = items.map { it.toDomain() },
    serviceable = serviceable,
    options = methods.map { it.toDomain() },
)

private fun QuotePackageItemDTO.toDomain(): QuotePackageItem = QuotePackageItem(
    productId = productID,
    name = name,
    imageUrl = imageURL,
    quantity = quantity.toInt(),
)

private fun DeliveryMethodOptionDTO.toDomain(): DeliveryOption = DeliveryOption(
    method = method.toDomain(),
    serviceLevel = serviceLevel,
    feeAmount = feeAmount,
    window = window,
    scheduleDates = scheduleDates ?: emptyList(),
)

internal fun CheckoutDeliveryMethod.toDomain(): DeliveryMethod = when (this) {
    CheckoutDeliveryMethod.SameDay -> DeliveryMethod.SAME_DAY
    CheckoutDeliveryMethod.Scheduled -> DeliveryMethod.SCHEDULED
    CheckoutDeliveryMethod.Standard -> DeliveryMethod.STANDARD
}

internal fun DeliveryMethod.toWire(): CheckoutDeliveryMethod = when (this) {
    DeliveryMethod.SAME_DAY -> CheckoutDeliveryMethod.SameDay
    DeliveryMethod.SCHEDULED -> CheckoutDeliveryMethod.Scheduled
    DeliveryMethod.STANDARD -> CheckoutDeliveryMethod.Standard
}

// domain → wire: the placement request. Selections carry the method (+ date), NEVER a fee (SC-004).
// `billingAddressID` is sent ONLY when the customer diverged billing (023 US4); null → same as shipping.
internal fun PlaceOrder.toRequest(): CreateCheckoutIntentRequest = CreateCheckoutIntentRequest(
    addressID = addressId,
    quoteID = quoteId,
    selections = selections.map { it.toWire() },
    excludedPackageKeys = excludedPackageKeys,
    billingAddressID = billingAddressId,
)

private fun DeliverySelection.toWire(): DeliverySelectionDTO = DeliverySelectionDTO(
    method = method.toWire(),
    packageKey = packageKey,
    scheduledDate = scheduledDate,
)

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

/** Format a snapshotted order address into one display line (shared by shipping + billing, 023 US5). */
private fun OrderAddressDTO.formatLine(): String = buildString {
    append(line1)
    line2?.let { append(", ").append(it) }
    append(", ").append(city).append(" ").append(postalCode)
    append(", ").append(country)
}

internal fun OrderDTO.toReceipt(): Receipt {
    val addr = deliveryAddress
    // 023 US5: `billingAddress` null → "same as shipping" (both billing fields stay null); a value →
    // the customer diverged and both addresses are shown in full (FR-016). Never COALESCE'd here.
    val billing = billingAddress
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
        addressLine = addr.formatLine(),
        billingRecipientName = billing?.recipientName,
        billingAddressLine = billing?.formatLine(),
        itemSubtotalAmount = itemSubtotalAmount,
        deliveryFeeAmount = deliveryFeeAmount,
        grandTotalAmount = grandTotalAmount,
        currency = currency,
    )
}
