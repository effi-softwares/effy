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
import com.effyshopping.customer.mobile.features.checkout.domain.ReceiptPromotion
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

// Delivery quote
// DTO → domain: `quantity` is a codegen Double narrowed to Int (contract note); DTOs never escape here.







// domain → wire: the placement request. Never a fee.
// `billingAddressID` is sent only when the customer diverged billing; null → same as shipping.
internal fun PlaceOrder.toRequest(): CreateCheckoutIntentRequest = CreateCheckoutIntentRequest(
    addressID = addressId,
    billingAddressID = billingAddressId,
    // Null is omitted from the wire (explicitNulls = false), and absent means "none".
    deliveryInstructions = deliveryInstructions?.toWire(),
    // The one window for the order; null (omitted) for a courier order.
    deliveryWindow = deliveryWindow?.takeIf { !asap }?.let { com.effyshopping.customer.mobile.commerce.contract.DeliveryWindow(date = it.date, slotID = it.slotId) },
    // "as soon as possible", sent alone.
    deliveryPromise = if (asap) com.effyshopping.customer.mobile.commerce.contract.DeliveryPromise.Asap else null,
    // Who delivers, as shown.
    deliveryType = when (deliveryType) {
        DeliveryType.EFFY -> ContractDeliveryType.Effy
        DeliveryType.COURIER -> ContractDeliveryType.Courier
        null -> null
    },
    // Mobile asks for a customer session; web does not. The in-app element renders the
    // provider's own saved-card list and needs a session to do it. The web card route renders Effy's
    // list and confirms by payment-method id, so minting one there would be an unused provider round
    // trip on a path 027 already found latency-sensitive (spike S2). This flag is the difference.
    wantsProviderMethodList = true,
    // Absent (null) when none, which the server reads as 0.
    pointsToUse = pointsToUse.takeIf { it > 0 },
    // What this screen shows for delivery; the server refuses a total it would not charge.
    shownDeliveryAmount = shownDeliveryAmount,
)

// Delivery quote: DTO → domain
// Money crosses as 2-dp decimal strings and is never recomputed here: the fee is the server's.

internal fun DeliveryQuoteDTO.toDomain(): DeliveryQuote {
    if (!serviced) return DeliveryQuote.Unserviced
    val myPoints = points?.let { CheckoutPoints(usable = it.usable, centsPerPoint = it.centsPerPoint) }
    // A courier delivers: one fee and an estimate, nothing to choose.
    courier?.let { c ->
        return DeliveryQuote(
            serviced = true,
            freeDeliveryRemainingAmount = freeDeliveryRemainingAmount,
            points = myPoints,
            courier = CourierDelivery(estimate = c.estimate, fee = c.fee.toDomain(), noWindowLeft = c.reason == CourierQuoteReason.NoWindow),
        )
    }
    // Effy delivers: the windows on offer. A serviced quote with neither block is a server fault;
    // it maps to a quote with nothing to choose, which cannot be paid for — never to a $0.00 order.
    return DeliveryQuote(
        serviced = true,
        freeDeliveryRemainingAmount = freeDeliveryRemainingAmount,
        points = myPoints,
        effyWindows = effyWindows?.toDomain(),
    )
}

/** The windows Effy offers. Exhaustive `when`s: a reason a newer server adds fails to compile here. */
internal fun com.effyshopping.customer.mobile.commerce.contract.EffyWindowsDTO.toDomain(): EffyWindows = EffyWindows(
    days = days.map { day ->
        EffyDay(
            date = day.date,
            today = day.section == DeliveryMethodDTO.SameDay,
            windows = day.windows.map { it.toDomain() },
            // Never today's, whatever a server sends.
            anyTime = day.anyTime?.takeIf { day.section != DeliveryMethodDTO.SameDay }?.toDomain(),
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
    asap = asap?.let { com.effyshopping.customer.mobile.features.checkout.domain.EffyAsap(estimate = it.estimate, fee = it.fee.toDomain()) },
)

private fun com.effyshopping.customer.mobile.commerce.contract.EffyWindowDTO.toDomain(): EffyWindow = EffyWindow(
    slotId = slotID, date = date, startAt = startAt, endAt = endAt, cutoffAt = cutoffAt,
    surchargeAmount = surchargeAmount, fee = fee.toDomain(),
)

internal fun com.effyshopping.customer.mobile.commerce.contract.DeliveryFeeDTO.toDomain(): DeliveryFee = DeliveryFee(
    // An exhaustive `when` over the generated enum: a kind a newer server adds fails to compile
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
    promotionAmount = promotionAmount,
)

/** The server's refusal, as the domain exception the ViewModel acts on. */
/** Who delivers a placed order. */
internal fun com.effyshopping.customer.mobile.commerce.contract.OrderDeliveryDTO.toDomain(): OrderDelivery = OrderDelivery(
    type = when (type) {
        ContractDeliveryType.Effy -> DeliveryType.EFFY
        ContractDeliveryType.Courier -> DeliveryType.COURIER
    },
    courierEstimate = courierEstimate,
    promise = when (promise) {
        com.effyshopping.customer.mobile.commerce.contract.PromiseEnum.Window -> com.effyshopping.customer.mobile.features.checkout.domain.DeliveryPromise.WINDOW
        com.effyshopping.customer.mobile.commerce.contract.PromiseEnum.Day -> com.effyshopping.customer.mobile.features.checkout.domain.DeliveryPromise.DAY
        com.effyshopping.customer.mobile.commerce.contract.PromiseEnum.Asap -> com.effyshopping.customer.mobile.features.checkout.domain.DeliveryPromise.ASAP
        null -> null
    },
    asapEstimate = asapEstimate,
    tracking = tracking?.let { t ->
        when (t.kind) {
            com.effyshopping.customer.mobile.commerce.contract.TrackingKind.Link ->
                t.url?.let { url -> com.effyshopping.customer.mobile.features.checkout.domain.OrderTracking.Link(url, t.courierName.orEmpty()) }
            com.effyshopping.customer.mobile.commerce.contract.TrackingKind.Email -> com.effyshopping.customer.mobile.features.checkout.domain.OrderTracking.ByEmail
        }
    },
    // The latest move by back-office, and what the customer received.
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
    // 051. Mapping these is the whole point: the wire has carried them since the server change, and a
    // mapper that drops what the backend sends is exactly how 033 found `brand`/`badges` missing and how
    // 019's order line lost its `productId`. Without `billingDetails` here the element collects nothing
    // and the provider refuses the payment — the failure is loud, but the cause would look like Stripe.
    customerSessionSecret = customerSessionSecret,
    customerId = customerID,
    billingDetails = billingDetails?.toDomain(),
    // Mapped, for the same reason: the payment screen refuses to confirm once this has passed.
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
        delivery = delivery.toDomain(),
        placedAt = placedAt,
        stage = stage?.toDomainStage(),
        arrivals = arrivalEstimates.orEmpty().map {
            com.effyshopping.customer.mobile.features.checkout.domain.ArrivalEstimate(
                method = it.method.value,
                promisedFrom = it.promisedFrom,
                promisedTo = it.promisedTo,
                windowStart = it.windowStart,
                windowEnd = it.windowEnd,
            )
        },
        deliveredAt = deliveredAt,
        thumbnails = thumbnails.orEmpty(),
        fullyRefunded = fullyRefunded == true,
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
 * A `when` over the generated enum with NO `else` that guesses. If a later slice adds a fifth stage,
 * this build's generated enum will not know it — and a receipt must degrade to [OrderStage.Unknown]
 * rather than assert a stage it cannot justify. An unrecognised value must never advance the
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
    // `billingAddress` null → "same as shipping" (both billing fields stay null); a value →
    // the customer diverged and both addresses are shown in full. Never coalesce'd here.
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
                variantLabel = it.variantLabel,
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
        promotions = promotions.orEmpty().map { ReceiptPromotion(headline = it.headline, code = it.code, goodsAmount = it.goodsAmount) },
        deliveryDiscountAmount = deliveryDiscountAmount,
        itemSubtotalAmount = itemSubtotalAmount,
        // Previously unmapped, so the receipt's lines did not add up whenever delivery was
        // charged (051 FR-043 fixed this on web and never here).
        deliveryFeeAmount = deliveryFeeAmount,
        deliveryFee = deliveryFee.toDomain(),
        grandTotalAmount = grandTotalAmount,
        currency = currency,
        placedAt = placedAt.orEmpty(),
        // Mapped (see `cancellable` below for why that needs saying).
        delivery = delivery.toDomain(),
        stage = stage.toDomainStage(),
        paymentMethod = paymentMethod?.let {
            PaymentMethodSummary(type = it.type.value, brand = it.brand, last4 = it.last4)
        },
        arrivalEstimates = arrivalEstimates.map {
            ArrivalEstimate(
                method = it.method.value,
                promisedFrom = it.promisedFrom,
                promisedTo = it.promisedTo,
                // The window the customer was sold; null for standard and for earlier orders.
                windowStart = it.windowStart,
                windowEnd = it.windowEnd,
            )
        },
        // Mapped, not derived. The mapper dropping a field the backend sends is how `brand`,
        // `badges` and `productId` went missing on this surface: the wire carried them and the
        // domain model simply did not ask.
        cancellable = cancellable,
        // Mapped, like `cancellable` above. Absent means no refunds, which renders
        // nothing rather than an empty section.
        refunds = refunds.orEmpty().map { it.toDomain() },
        refundedTotal = refundedTotal ?: "0.00",
        // Falls back to the charged total, not to "0.00". With no refunds the shopper is out of
        // pocket the whole amount, and a zero here would tell them they paid nothing.
        amountPaidAfterRefunds = amountPaidAfterRefunds ?: grandTotalAmount,
        fullyRefunded = fullyRefunded ?: false,
        // Absent on an order that used no points.
        paymentSplit = paymentSplit?.let { PaymentSplit(pointsUsed = it.pointsUsed, pointsAmount = it.pointsAmount, cardAmount = it.cardAmount) },
    )
}

/**
 * The wire refund → the domain refund.
 *
 * A `when` over the generated enum with NO `else` that guesses, exactly like `toDomainStage`. An
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
