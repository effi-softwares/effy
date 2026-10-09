package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.features.deliveryinstructions.data.toDomain
import com.effyshopping.customer.mobile.features.deliveryinstructions.data.toWire
import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentRequest
import com.effyshopping.customer.mobile.commerce.contract.CreateCheckoutIntentResponse
import com.effyshopping.customer.mobile.commerce.contract.OrderAddressDTO
import com.effyshopping.customer.mobile.commerce.contract.CustomerRefundDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderDTO
import com.effyshopping.customer.mobile.commerce.contract.State as DtoRefundState
import com.effyshopping.customer.mobile.commerce.contract.OrderStage as DtoOrderStage
import com.effyshopping.customer.mobile.commerce.contract.DeliveryMethod as DeliveryMethodDTO
import com.effyshopping.customer.mobile.commerce.contract.CourierQuoteReason
import com.effyshopping.customer.mobile.commerce.contract.DeliveryChoiceRefusalCode
import com.effyshopping.customer.mobile.commerce.contract.DeliveryType as ContractDeliveryType
import com.effyshopping.customer.mobile.commerce.contract.DeliveryChoiceRefusalDTO
import com.effyshopping.customer.mobile.commerce.contract.DeliveryQuoteDTO
import com.effyshopping.customer.mobile.features.checkout.domain.CourierDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefusal
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.EffyDay
import com.effyshopping.customer.mobile.features.checkout.domain.EffyDayClosed
import com.effyshopping.customer.mobile.features.checkout.domain.EffyWindow
import com.effyshopping.customer.mobile.features.checkout.domain.EffyWindows
import com.effyshopping.customer.mobile.features.checkout.domain.WindowsUnavailable
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefused
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFee
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLine
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.CustomerRefund
import com.effyshopping.customer.mobile.features.checkout.domain.CustomerRefundState
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import com.effyshopping.customer.mobile.features.checkout.domain.ReceiptItem
import com.effyshopping.customer.mobile.features.checkout.domain.ArrivalEstimate
import com.effyshopping.customer.mobile.features.checkout.domain.OrderStage
import com.effyshopping.customer.mobile.features.checkout.domain.PaymentMethodSummary
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutPoints
import com.effyshopping.customer.mobile.features.checkout.domain.PaymentSplit

// ── Delivery quote (021) ────────────────────────────────────────────────────────────────────────────
// DTO → domain: `quantity` is a codegen Double narrowed to Int (contract note); DTOs never escape here.







// domain → wire: the placement request. NEVER a fee (SC-004).
// `billingAddressID` is sent ONLY when the customer diverged billing (023 US4); null → same as shipping.
internal fun PlaceOrder.toRequest(): CreateCheckoutIntentRequest = CreateCheckoutIntentRequest(
    addressID = addressId,
    billingAddressID = billingAddressId,
    // 066 — null is omitted from the wire (explicitNulls = false), and absent means "none".
    deliveryInstructions = deliveryInstructions?.toWire(),
    // 078 — the one window for the order; null (omitted) for a courier order.
    deliveryWindow = deliveryWindow?.let { com.effyshopping.customer.mobile.commerce.contract.DeliveryWindow(date = it.date, slotID = it.slotId) },
    // 079 — who delivers, as shown.
    deliveryType = when (deliveryType) {
        DeliveryType.EFFY -> ContractDeliveryType.Effy
        DeliveryType.COURIER -> ContractDeliveryType.Courier
        null -> null
    },
    // ⚠ 051 — MOBILE ASKS FOR A CUSTOMER SESSION; WEB DOES NOT. The in-app element renders the
    // provider's own saved-card list and needs a session to do it. The web card route renders Effy's
    // list and confirms by payment-method id, so minting one there would be an unused provider round
    // trip on a path 027 already found latency-sensitive (spike S2). This flag is the difference.
    wantsProviderMethodList = true,
    // 074 — absent (null) when none, which the server reads as 0.
    pointsToUse = pointsToUse.takeIf { it > 0 },
    // 077 — what this screen shows for delivery; the server refuses a total it would not charge.
    shownDeliveryAmount = shownDeliveryAmount,
)

// ── Delivery quote: DTO → domain ────────────────────────────────────────────────────────────────────
// Money crosses as 2-dp decimal strings and is never recomputed here: the fee is the server's.

internal fun DeliveryQuoteDTO.toDomain(): DeliveryQuote {
    if (!serviced) return DeliveryQuote.Unserviced
    val myPoints = points?.let { CheckoutPoints(usable = it.usable, centsPerPoint = it.centsPerPoint) }
    // 079 — a courier delivers: one fee and an estimate, nothing to choose.
    courier?.let { c ->
        return DeliveryQuote(
            serviced = true,
            freeDeliveryRemainingAmount = freeDeliveryRemainingAmount,
            points = myPoints,
            courier = CourierDelivery(estimate = c.estimate, fee = c.fee.toDomain(), noWindowLeft = c.reason == CourierQuoteReason.NoWindow),
        )
    }
    // Effy delivers: the windows on offer. ⚠ A serviced quote with neither block is a server fault;
    // it maps to a quote with nothing to choose, which cannot be paid for — never to a $0.00 order.
    return DeliveryQuote(
        serviced = true,
        freeDeliveryRemainingAmount = freeDeliveryRemainingAmount,
        points = myPoints,
        effyWindows = effyWindows?.toDomain(),
    )
}

/** 078 — the windows Effy offers. ⚠ Exhaustive `when`s: a reason a newer server adds fails to compile here. */
internal fun com.effyshopping.customer.mobile.commerce.contract.EffyWindowsDTO.toDomain(): EffyWindows = EffyWindows(
    days = days.map { day ->
        EffyDay(
            date = day.date,
            today = day.section == DeliveryMethodDTO.SameDay,
            windows = day.windows.map {
                EffyWindow(
                    slotId = it.slotID, date = it.date, startAt = it.startAt, endAt = it.endAt, cutoffAt = it.cutoffAt,
                    surchargeAmount = it.surchargeAmount, fee = it.fee.toDomain(),
                )
            },
            closedReason = when (day.closedReason) {
                com.effyshopping.customer.mobile.commerce.contract.EffyDayClosedReason.NotDeliveryDay -> EffyDayClosed.NotDeliveryDay
                com.effyshopping.customer.mobile.commerce.contract.EffyDayClosedReason.Closed -> EffyDayClosed.Closed
                com.effyshopping.customer.mobile.commerce.contract.EffyDayClosedReason.Full -> EffyDayClosed.Full
                null -> null
            },
        )
    },
    unavailable = when (unavailable) {
        com.effyshopping.customer.mobile.commerce.contract.Unavailable.NoWindows -> WindowsUnavailable.NoWindows
        com.effyshopping.customer.mobile.commerce.contract.Unavailable.NoneDefined -> WindowsUnavailable.NoneDefined
        null -> null
    },
)

internal fun com.effyshopping.customer.mobile.commerce.contract.DeliveryFeeDTO.toDomain(): DeliveryFee = DeliveryFee(
    // ⚠ An exhaustive `when` over the generated enum: a kind a newer server adds fails to compile
    // here rather than being shown under a guessed label.
    lines = lines.map {
        DeliveryFeeLine(
            kind = when (it.kind) {
                com.effyshopping.customer.mobile.commerce.contract.DeliveryFeeLineKind.Delivery -> DeliveryFeeLineKind.Delivery
                com.effyshopping.customer.mobile.commerce.contract.DeliveryFeeLineKind.WindowSurcharge -> DeliveryFeeLineKind.WindowSurcharge
                com.effyshopping.customer.mobile.commerce.contract.DeliveryFeeLineKind.SmallOrder -> DeliveryFeeLineKind.SmallOrder
                com.effyshopping.customer.mobile.commerce.contract.DeliveryFeeLineKind.FreeDelivery -> DeliveryFeeLineKind.FreeDelivery
            },
            amount = it.amount,
        )
    },
    totalAmount = totalAmount,
)

/** 069 — the server's refusal, as the domain exception the ViewModel acts on. */
/** 079 — who delivers a placed order. */
internal fun com.effyshopping.customer.mobile.commerce.contract.OrderDeliveryDTO.toDomain(): OrderDelivery = OrderDelivery(
    type = when (type) {
        ContractDeliveryType.Effy -> DeliveryType.EFFY
        ContractDeliveryType.Courier -> DeliveryType.COURIER
    },
    courierEstimate = courierEstimate,
    tracking = tracking?.let { t ->
        when (t.kind) {
            com.effyshopping.customer.mobile.commerce.contract.TrackingKind.Link ->
                t.url?.let { url -> com.effyshopping.customer.mobile.features.checkout.domain.OrderTracking.Link(url, t.courierName.orEmpty()) }
            com.effyshopping.customer.mobile.commerce.contract.TrackingKind.Email -> com.effyshopping.customer.mobile.features.checkout.domain.OrderTracking.ByEmail
        }
    },
    // 081 — the latest move by back-office, and what the customer received.
    moved = moved?.let { m ->
        com.effyshopping.customer.mobile.features.checkout.domain.OrderDeliveryMove(
            to = when (m.to) {
                ContractDeliveryType.Effy -> DeliveryType.EFFY
                ContractDeliveryType.Courier -> DeliveryType.COURIER
            },
            compensation = m.compensation?.let { c ->
                when (c.kind) {
                    com.effyshopping.customer.mobile.commerce.contract.CompensationKind.Points ->
                        com.effyshopping.customer.mobile.features.checkout.domain.CustomerCompensation.Points(c.amount, (c.points ?: 0.0).toInt())
                    com.effyshopping.customer.mobile.commerce.contract.CompensationKind.Refund ->
                        com.effyshopping.customer.mobile.features.checkout.domain.CustomerCompensation.Refund(c.amount)
                }
            },
        )
    },
)

internal fun DeliveryChoiceRefusalDTO.toDomain(): DeliveryChoiceRefused = DeliveryChoiceRefused(
    reason = when (code) {
        DeliveryChoiceRefusalCode.SlotRequired -> DeliveryChoiceRefusal.SlotRequired
        DeliveryChoiceRefusalCode.SlotUnavailable -> DeliveryChoiceRefusal.SlotUnavailable
        DeliveryChoiceRefusalCode.DateUnavailable -> DeliveryChoiceRefusal.DateUnavailable
        DeliveryChoiceRefusalCode.NoWindowsAvailable -> DeliveryChoiceRefusal.NoWindowsAvailable
        DeliveryChoiceRefusalCode.DeliveryTypeChanged -> DeliveryChoiceRefusal.DeliveryTypeChanged
    },
    quote = quote?.toDomain(),
)


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
    // 069 — mapped, for the same reason: the payment screen refuses to confirm once this has passed.
    slotHeldUntil = slotHeldUntil,
    // 074
    pointsUsed = pointsUsed ?: 0,
    pointsAmount = pointsAmount,
    cardAmount = cardAmount,
    paidWithPoints = paidWithPoints == true,
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
        delivery = delivery?.toDomain(),
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
                orderItemId = it.orderItemID,
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
        deliveryInstructions = deliveryInstructions.toDomain(),
        discountAmount = discountAmount,
        promoCode = promoCode,
        itemSubtotalAmount = itemSubtotalAmount,
        // ⚠ 052 — previously UNMAPPED, so the receipt's lines did not add up whenever delivery was
        // charged (051 FR-043 fixed this on web and never here).
        deliveryFeeAmount = deliveryFeeAmount,
        deliveryFee = deliveryFee?.toDomain(),
        grandTotalAmount = grandTotalAmount,
        currency = currency,
        placedAt = placedAt.orEmpty(),
        // 079 — MAPPED (see `cancellable` below for why that needs saying).
        delivery = delivery?.toDomain(),
        stage = stage.toDomainStage(),
        paymentMethod = paymentMethod?.let {
            PaymentMethodSummary(type = it.type.value, brand = it.brand, last4 = it.last4)
        },
        arrivalEstimates = arrivalEstimates.map {
            ArrivalEstimate(
                method = it.method.value,
                promisedFrom = it.promisedFrom,
                promisedTo = it.promisedTo,
                // 069 — the window the customer was sold; null for standard and for earlier orders.
                windowStart = it.windowStart,
                windowEnd = it.windowEnd,
            )
        },
        // ⚠ 055 — MAPPED, not derived. The mapper dropping a field the backend sends is how `brand`,
        // `badges` and (033) `productId` went missing on this surface: the wire carried them and the
        // domain model simply did not ask.
        cancellable = cancellable,
        // ⚠ 055 US5 — MAPPED, like `cancellable` above. Absent means no refunds, which renders
        // NOTHING (FR-028) rather than an empty section.
        refunds = refunds.orEmpty().map { it.toDomain() },
        refundedTotal = refundedTotal ?: "0.00",
        // ⚠ Falls back to the CHARGED total, not to "0.00". With no refunds the shopper is out of
        // pocket the whole amount, and a zero here would tell them they paid nothing.
        amountPaidAfterRefunds = amountPaidAfterRefunds ?: grandTotalAmount,
        fullyRefunded = fullyRefunded ?: false,
        // 074 — absent on an order that used no points.
        paymentSplit = paymentSplit?.let { PaymentSplit(pointsUsed = it.pointsUsed, pointsAmount = it.pointsAmount, cardAmount = it.cardAmount) },
    )
}

/**
 * The wire refund → the domain refund.
 *
 * ⚠ A `when` over the generated enum with NO `else` that guesses, exactly like `toDomainStage`. An
 * unrecognised state must degrade to "on its way" and never to "completed" — telling a shopper their
 * money has arrived is the one claim that stops them looking for it.
 */
private fun CustomerRefundDTO.toDomain(): CustomerRefund = CustomerRefund(
    amount = amount,
    state = when (state) {
        DtoRefundState.Completed -> CustomerRefundState.Completed
        DtoRefundState.ThereWasAProblem -> CustomerRefundState.ThereWasAProblem
        DtoRefundState.OnItsWay -> CustomerRefundState.OnItsWay
    },
    refundedAt = refundedAt,
)
