package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentRequest
import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentResponse
import com.effyshopping.customer.mobile.commerce.contract.OrderAddressDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderStage as DtoOrderStage
import com.effyshopping.customer.mobile.commerce.contract.DeliveryMethod as DeliveryMethodDTO
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import com.effyshopping.customer.mobile.features.checkout.domain.ReceiptItem
import com.effyshopping.customer.mobile.features.checkout.domain.ArrivalEstimate
import com.effyshopping.customer.mobile.features.checkout.domain.OrderStage
import com.effyshopping.customer.mobile.features.checkout.domain.PaymentMethodSummary

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
    // ⚠ 051 — MOBILE ASKS FOR A CUSTOMER SESSION; WEB DOES NOT. The in-app element renders the
    // provider's own saved-card list and needs a session to do it. The web card route renders Effy's
    // list and confirms by payment-method id, so minting one there would be an unused provider round
    // trip on a path 027 already found latency-sensitive (spike S2). This flag is the difference.
    wantsProviderMethodList = true,
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
    // ⚠ 051. Mapping these is the whole point: the wire has carried them since the server change, and a
    // mapper that drops what the backend sends is exactly how 033 found `brand`/`badges` missing and how
    // 019's order line lost its `productId`. Without `billingDetails` here the element collects nothing
    // and the provider refuses the payment — the failure is loud, but the cause would look like Stripe.
    customerSessionSecret = customerSessionSecret,
    customerId = customerID,
    billingDetails = billingDetails?.toDomain(),
)

private fun com.effyshopping.customer.mobile.commerce.contract.BillingDetailsDTO.toDomain() =
    com.effyshopping.customer.mobile.features.checkout.domain.CheckoutBillingDetails(
        name = name,
        email = email,
        line1 = address.line1,
        line2 = address.line2,
        city = address.city,
        state = address.state,
        postalCode = address.postalCode,
        country = address.country,
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

/**
 * The wire stage → the domain stage.
 *
 * ⚠ A `when` over the generated enum with NO `else` that guesses. If a later slice adds a fifth stage,
 * this build's generated enum will not know it — and a receipt must degrade to [OrderStage.Unknown]
 * rather than assert a stage it cannot justify. An unrecognised value must never ADVANCE the
 * customer's view of their order.
 */
private fun DtoOrderStage.toDomainStage(): OrderStage = when (this) {
    DtoOrderStage.Confirmed -> OrderStage.Confirmed
    DtoOrderStage.Packing -> OrderStage.Packing
    DtoOrderStage.OnTheWay -> OrderStage.OnTheWay
    DtoOrderStage.Delivered -> OrderStage.Delivered
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
                imageUrl = it.imageURL,
            )
        },
        recipientName = addr.recipientName,
        addressLine = addr.formatLine(),
        billingRecipientName = billing?.recipientName,
        billingAddressLine = billing?.formatLine(),
        discountAmount = discountAmount,
        promoCode = promoCode,
        itemSubtotalAmount = itemSubtotalAmount,
        // ⚠ 052 — previously UNMAPPED, so the receipt's lines did not add up whenever delivery was
        // charged (051 FR-043 fixed this on web and never here).
        deliveryFeeAmount = deliveryFeeAmount,
        grandTotalAmount = grandTotalAmount,
        currency = currency,
        placedAt = placedAt.orEmpty(),
        stage = stage.toDomainStage(),
        paymentMethod = paymentMethod?.let {
            PaymentMethodSummary(type = it.type.value, brand = it.brand, last4 = it.last4)
        },
        arrivalEstimates = arrivalEstimates.map {
            ArrivalEstimate(
                method = it.method.value,
                promisedFrom = it.promisedFrom,
                promisedTo = it.promisedTo,
            )
        },
    )
}
