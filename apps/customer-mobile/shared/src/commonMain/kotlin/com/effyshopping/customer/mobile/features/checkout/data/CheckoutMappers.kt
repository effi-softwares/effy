package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentRequest
import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentResponse
import com.effyshopping.customer.mobile.commerce.contract.OrderAddressDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.DeliveryMethod as DeliveryMethodDTO
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import com.effyshopping.customer.mobile.features.checkout.domain.ReceiptItem

// ── Delivery quote (021) ────────────────────────────────────────────────────────────────────────────
// DTO → domain: `quantity` is a codegen Double narrowed to Int (contract note); DTOs never escape here.







// domain → wire: the placement request. Selections carry the method (+ date), NEVER a fee (SC-004).
// `billingAddressID` is sent ONLY when the customer diverged billing (023 US4); null → same as shipping.
/** Placement carries an address, an optional divergent billing address, and the delivery method (047). */
internal fun PlaceOrder.toRequest(): CreateCheckoutIntentRequest = CreateCheckoutIntentRequest(
    addressID = addressId,
    billingAddressID = billingAddressId,
    // Send same_day only when chosen; standard is the server default (a null keeps the wire minimal).
    deliveryMethod = if (deliveryMethod == DeliveryMethod.SAME_DAY) "same_day" else null,
)

// ── Delivery quote (047): DTO → domain ──────────────────────────────────────────────────────────────
// Money crosses as 2-dp decimal strings; we sum in integer cents and format back (never a float).

private fun centsOf(s: String): Long {
    val neg = s.startsWith("-")
    val body = if (neg) s.substring(1) else s
    val dot = body.indexOf('.')
    val whole = if (dot < 0) body else body.substring(0, dot)
    val frac = if (dot < 0) "" else body.substring(dot + 1)
    val f2 = (frac + "00").substring(0, 2)
    val cents = (whole.toLongOrNull() ?: 0L) * 100 + (f2.toLongOrNull() ?: 0L)
    return if (neg) -cents else cents
}

private fun formatCents(c: Long): String {
    val neg = c < 0
    val v = if (neg) -c else c
    val s = "${v / 100}.${(v % 100).toString().padStart(2, '0')}"
    return if (neg) "-$s" else s
}

/**
 * Sum the per-package fee for a method across the quote, falling back to standard per package where the
 * method is not offered (mirrors the server's per-package resolution, FR-044).
 */
private fun DeliveryQuoteDTO.totalFor(method: DeliveryMethodDTO): Long =
    packages.sumOf { pkg ->
        val opt = pkg.options.firstOrNull { it.method == method }
            ?: pkg.options.firstOrNull { it.method == DeliveryMethodDTO.Standard }
            ?: pkg.options.firstOrNull()
        opt?.let { centsOf(it.feeAmount) } ?: 0L
    }

internal fun DeliveryQuoteDTO.toDomain(): DeliveryQuote {
    if (!serviced) return DeliveryQuote.Unserviced
    // Same-day is offerable only when EVERY package can do it (so the order-level choice is honest and
    // never leaks that a basket spans shops).
    val sameDayAvailable = packages.isNotEmpty() &&
        packages.all { pkg -> pkg.options.any { it.method == DeliveryMethodDTO.SameDay } }
    return DeliveryQuote(
        serviced = true,
        sameDayAvailable = sameDayAvailable,
        standardTotalAmount = formatCents(totalFor(DeliveryMethodDTO.Standard)),
        sameDayTotalAmount = if (sameDayAvailable) formatCents(totalFor(DeliveryMethodDTO.SameDay)) else null,
    )
}


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
                productId = it.productID,
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
        discountAmount = discountAmount,
        promoCode = promoCode,
        itemSubtotalAmount = itemSubtotalAmount,
        grandTotalAmount = grandTotalAmount,
        currency = currency,
    )
}
