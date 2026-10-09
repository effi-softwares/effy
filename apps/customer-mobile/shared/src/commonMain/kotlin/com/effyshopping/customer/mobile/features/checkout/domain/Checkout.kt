package com.effyshopping.customer.mobile.features.checkout.domain

import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.DeliveryInstructions
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException

/**
 * Checkout domain (019 US3, reshaped by 051). The server owns the amount + the PaymentIntent; checkout
 * creates the intent and STOPS. Paying is the payment screen's job, and the receipt is
 * webhook-authoritative.
 */

data class CheckoutIntent(
    val orderId: String,
    val orderNumber: String,
    val clientSecret: String,
    // The backend's publishable-key echo (config.go marks it a convenience). Retained to mirror the wire,
    // but the pay flow uses the client's OWN key (AppConfig.stripePublishableKey) — see `PaymentViewModel`.
    val publishableKey: String,
    val grandTotalAmount: String,
    val currency: String,
    /**
     * 051 — authorizes the provider-owned saved-card list for this shopper. Null for a shopper who has
     * never paid (they have no provider record yet), which is not an error.
     */
    val customerSessionSecret: String? = null,
    /**
     * 051 US3 — the provider customer the session belongs to. Required BESIDE the secret: both mobile
     * SDKs take them together, and a session without its id cannot be attached.
     */
    val customerId: String? = null,
    /**
     * 051 — the billing details the CLIENT attaches at confirmation, because the payment screen no
     * longer asks the shopper for a country, a postcode or a name (FR-014/FR-015).
     *
     * ⚠ Derived by the server from the address the shopper already confirmed. Null only for an order
     * placed before 051; the element then collects nothing and the provider refuses, which is loud and
     * correct rather than silently charging against a guessed address.
     */
    val billingDetails: CheckoutBillingDetails? = null,
    /**
     * 069 — until when the order's same-day place is held (ISO instant), or null when nothing is
     * same-day. ⚠ Once this has passed the place may have gone to someone else, and the payment
     * screen must not confirm: the intent call is the last moment the server can refuse before the
     * shopper is charged.
     */
    val slotHeldUntil: String? = null,
    /** 074 — the points this order uses, and what is left for the card. */
    val pointsUsed: Long = 0,
    val pointsAmount: String? = null,
    val cardAmount: String? = null,
    /**
     * 074 — TRUE when points covered everything: the order is ALREADY PAID, there is no card step and
     * [clientSecret] is empty. The app goes straight to the receipt.
     */
    val paidWithPoints: Boolean = false,
) {
    /** What the card is charged: the total less any points. */
    val amountForCard: String get() = cardAmount ?: grandTotalAmount
}

/** The billing details Effy attaches on the shopper's behalf (051 FR-016). */
data class CheckoutBillingDetails(
    val name: String?,
    val email: String?,
    val line1: String,
    val line2: String?,
    val city: String,
    val state: String,
    val postalCode: String,
    val country: String,
)

data class ReceiptItem(
    /**
     * ⚠ ADDED BY 055 — THIS LINE's own id, and the SAME omission 033 records below for `productId`.
     * The wire has never carried it until now; the domain model has never asked for it.
     *
     * ⚠ NOT INTERCHANGEABLE WITH [productId]. An order can carry the same product on two lines, so a
     * product id cannot identify one — and naming a product where a line is expected does not error:
     * the server's join matches nothing and every item the shopper named is SILENTLY DROPPED.
     */
    val orderItemId: String,
    /**
     * ⚠ ADDED BY 033 so a shopper can save a product from a past order (FR-008).
     *
     * The wire has carried this since 019 — `OrderItemDTO.productId` — and this domain model simply
     * dropped it, which is the same mapper-discards-what-the-backend-sends shape that hid brand and
     * badges on the saved list. No contract change was needed; the field needed mapping.
     *
     * ⚠ A past order's product may since have been archived or deleted. The ORDER line still renders
     * from its own snapshot (that is what makes a receipt stable), so the save control here must
     * tolerate an id that no longer resolves — saving it answers 404, and the control says so rather
     * than appearing to succeed.
     */
    val productId: String,
    val productName: String,
    val quantity: Int,
    val unitPriceAmount: String,
    val lineSubtotalAmount: String,
    /**
     * 052 — the product's primary image, or null.
     *
     * ⚠ DECORATION ONLY, and never a carrier of meaning. A line renders complete without it and
     * nothing on the receipt may be gated on its presence. Every OTHER field here is the order's own
     * snapshot; this one resolves against the live catalogue, which is why it can go missing.
     */
    val imageUrl: String? = null,
)

/**
 * 052 — the customer-facing progress stage (FR-008).
 *
 * ⚠ SERVER-DERIVED. The backend computes this from every fulfilment portion and puts it on the wire;
 * this app renders it and never recomputes it. Two clients deriving one answer independently is
 * 029's banner target and 033's `available` flag — and the failure is silent, because both surfaces
 * still render *something*.
 *
 * [Unknown] exists because the wire union is closed and this build's copy of it can go stale: a fifth
 * stage added by a later slice must degrade to "we cannot say" rather than crash a receipt.
 */
enum class OrderStage { Confirmed, Packing, OnTheWay, Delivered, Unknown }

/**
 * 052 — how the order was paid (FR-006).
 *
 * ⚠ NO CARD DATA BEYOND [last4], ever. There is no field here for a card number, an expiry or a
 * cardholder name, and none may be added.
 */
data class PaymentMethodSummary(
    val type: String,
    val brand: String?,
    val last4: String?,
)

/**
 * 052 — when one package is expected to ARRIVE, as shown at checkout (FR-007).
 *
 * [promisedFrom]/[promisedTo] are the delivery DAY (yyyy-mm-dd). [windowStart]/[windowEnd] are the
 * same-day time window the customer was sold (069), as ISO instants — null for a standard delivery and
 * for every order placed before 069. ⚠ A time is rendered ONLY from a window that is present; nothing
 * is derived. Say it through [DeliveryWindowText.formatArrival].
 *
 * ⚠ It carries no shop reference of any kind (FR-009).
 */
data class ArrivalEstimate(
    val method: String,
    val promisedFrom: String?,
    val promisedTo: String?,
    val windowStart: String? = null,
    val windowEnd: String? = null,
)

/**
 * The receipt (019, extended 023 US5). [recipientName] + [addressLine] are the SHIPPING snapshot (always
 * shown in full). [billingRecipientName] + [billingAddressLine] are the BILLING snapshot: both null means
 * "same as shipping" (the client renders that text, not a repeated address); non-null means the customer
 * diverged and both are shown in full (FR-016).
 */
data class Receipt(
    val id: String,
    val orderNumber: String,
    val paid: Boolean,
    val items: List<ReceiptItem>,
    val recipientName: String,
    val addressLine: String,
    val billingRecipientName: String?,
    val billingAddressLine: String?,
    val itemSubtotalAmount: String,
    /**
     * ⚠ 052 — THE DELIVERY FEE, AND ITS ABSENCE HERE WAS A LIVE DEFECT.
     *
     * 051 FR-043 recorded that delivery sat inside the total and appeared nowhere, and fixed it on
     * customer-web. Mobile was never mapped, so this screen showed Items − Discount = Total while the
     * shopper had actually been charged a delivery fee — a receipt whose lines do not add up is not
     * one anybody can check. Null/"0.00" when there is none.
     */
    val deliveryFeeAmount: String? = null,
    /**
     * 077 — the same charge as the lines the shopper was sold (delivery, window surcharge, small-order
     * fee, free delivery). Stored with the order and never re-priced. Null on an order placed before
     * 077, which shows the single [deliveryFeeAmount] row instead.
     */
    val deliveryFee: DeliveryFee? = null,
    /**
     * 027 — what a promotional code took off, as computed at PAYMENT, and the code itself. Read from the
     * ORDER rather than re-derived, so a receipt explains itself years later even if the code has since
     * changed or been disabled (FR-049). Null/"0.00" when none was used.
     */
    val discountAmount: String? = null,
    val promoCode: String? = null,
    /**
     * 066 — what the shopper told the driver when the order was placed. Null when they said nothing,
     * which includes every order placed before 066 — and the receipt then shows NOTHING: no heading,
     * no placeholder.
     */
    val deliveryInstructions: DeliveryInstructions? = null,
    val grandTotalAmount: String,
    val currency: String,
    /**
     * 079 — who delivers the order, and a courier's timeframe as it was SOLD. Null for an order placed
     * before orders had a delivery type. ⚠ For a courier order [arrivalEstimates] is empty: say it
     * through `deliverySummary`, never from a package's own method.
     */
    val delivery: OrderDelivery? = null,
    /** 052 — when the order was placed, pre-formatted by the mapper. Empty when unknown. */
    val placedAt: String = "",
    /** 052 — server-derived progress (FR-008). */
    val stage: OrderStage = OrderStage.Confirmed,
    /** 052 — null when never captured: a pre-052 order, or a failed post-commit capture. */
    val paymentMethod: PaymentMethodSummary? = null,
    /** 052 — one entry per package. More than one means the order arrives in more than one delivery. */
    val arrivalEstimates: List<ArrivalEstimate> = emptyList(),
    /**
     * 055 — may the SHOPPER still cancel this themselves? (FR-012)
     *
     * ⚠ SERVER-DERIVED, like [stage] beside it, and for the same reason: a second implementation of
     * one rule diverges silently because both sides still render something. This screen never works
     * it out from [stage] or the portions.
     *
     * ⚠ `false` DOES NOT MEAN "never cancellable" — staff can, right up until the order leaves the
     * shop. Any wording built on this must leave that door open.
     */
    val cancellable: Boolean = false,
    /**
     * 055 US5 — every refund on this order, newest first (FR-023).
     *
     * ⚠ EMPTY MEANS RENDER NOTHING (FR-028), not an empty section. The server omits the fields
     * entirely when there are no refunds, so an unrefunded order looks exactly as it did before 055.
     */
    val refunds: List<CustomerRefund> = emptyList(),
    /** What has actually been returned or is on its way. "0.00" when none. */
    val refundedTotal: String = "0.00",
    /**
     * What the shopper is out of pocket after refunds.
     *
     * ⚠ NOT a correction to [grandTotalAmount] (FR-024) — that is what was CHARGED, a historical
     * record. A receipt that rewrote itself after a refund could not be reconciled against a bank
     * statement, which is the one thing a receipt is for.
     */
    val amountPaidAfterRefunds: String = "",
    /** ⚠ Derived by the server from the totals, never a stored flag. */
    val fullyRefunded: Boolean = false,
    /** 074 — how the order was paid when points were part of it. Null when none were used. */
    val paymentSplit: PaymentSplit? = null,
) {
    /** True when billing == shipping (the common case) → "Billing: same as shipping" (FR-016). */
    val billingSameAsShipping: Boolean get() = billingAddressLine == null
}

/**
 * One refund, as the SHOPPER sees it (055 FR-025).
 *
 * ⚠ THREE STATES AND NO FAILURE TEXT. Five internal states collapse to three because a shopper
 * cannot act on the difference between "we have not heard from the provider" and "the provider has
 * it", and whether a refund was *refused* rather than *failed* is a fact about our integration. The
 * provider's own reason is not on the wire at all — the server never selects the column.
 */
data class CustomerRefund(
    val amount: String,
    val state: CustomerRefundState,
    /** When the money actually landed. Null until it has — never a promise of when it will. */
    val refundedAt: String? = null,
)

enum class CustomerRefundState { OnItsWay, Completed, ThereWasAProblem }

/**
 * What placement needs: where it goes, what the shopper chose, and what this screen is showing.
 *
 * ⚠ The client never sends a fee — the server prices the order (047 SC-004) — and never anything
 * about how the order splits across suppliers.
 */
data class PlaceOrder(
    val addressId: String,
    /** Set only when the shopper diverged from shipping (023). Null means "same as shipping". */
    val billingAddressId: String? = null,
    /**
     * 066 — what the shopper tells the driver for THIS order, or null when they said nothing.
     *
     * ⚠ The server stores exactly this. It never reads the address's saved default — prefilling from
     * that is this app's job — which is why editing an address later cannot change a placed order.
     */
    val deliveryInstructions: DeliveryInstructions? = null,
    /**
     * The ONE window chosen for the order when Effy delivers (078); null for a courier order, which
     * has nothing to choose. ⚠ Never substituted: a window that has gone is a [DeliveryChoiceRefused].
     */
    val deliveryWindow: ChosenWindow? = null,
    /**
     * 079 — who delivers the order, as this screen is SHOWING it ([DeliveryQuote.deliveryType]). A
     * courier order is refused without it, and so is one that says "courier" for an address Effy now
     * delivers to ([DeliveryChoiceRefusal.DeliveryTypeChanged]) — nobody pays a courier fee for a
     * screen that showed Effy's windows.
     */
    val deliveryType: DeliveryType? = null,
    /** 074 — whole points to pay with; 0 for none. The server re-decides the split and refuses rather than changes it. */
    val pointsToUse: Long = 0,
    /**
     * 077 — the delivery total this screen is SHOWING. If the server would now charge another, it
     * refuses ([DeliveryFeeChanged]) and nothing is written or charged. Null sends no check.
     */
    val shownDeliveryAmount: String? = null,
)

/** 077 — one line of what delivery costs. Only [DeliveryFeeLineKind.FreeDelivery] is negative. */
enum class DeliveryFeeLineKind { Delivery, WindowSurcharge, SmallOrder, FreeDelivery }

data class DeliveryFeeLine(val kind: DeliveryFeeLineKind, val amount: String)

/**
 * 077 — what the shopper pays for delivery, in lines that sum to [totalAmount]. ⚠ Nothing else: no
 * distance, weight or plan ever reaches the app (FR-032).
 */
data class DeliveryFee(val lines: List<DeliveryFeeLine>, val totalAmount: String) {
    val free: Boolean get() = lines.any { it.kind == DeliveryFeeLineKind.FreeDelivery }
}

/**
 * 077 — the delivery total changed between the quote and the pay button (a new fee plan went live,
 * or the basket crossed a threshold). Nothing was charged. [quote] is what is on offer NOW.
 */
class DeliveryFeeChanged(val quote: DeliveryQuote?) : Exception("delivery fee changed")

/** 074 — points as a way of paying, on a receipt: never a discount line. */
data class PaymentSplit(val pointsUsed: Long, val pointsAmount: String, val cardAmount: String)

/** 074 — what the shopper can spend at checkout. Absent from the quote when they have none. */
data class CheckoutPoints(val usable: Long, val centsPerPoint: Long) {
    /** "$12.50" worth, as a 2-dp string. */
    val valueAmount: String get() {
        val c = usable * centsPerPoint
        return "${c / 100}.${(c % 100).toString().padStart(2, '0')}"
    }
}

/** 074 — why the server refused the points asked for. Nothing was charged. */
enum class PointsRefusal { BalanceChanged, ExceedTotal, CardRemainderTooSmall, PaymentInProgress }

/** 074 — a points refusal, with the most points the server would accept when it said. */
class PointsRefused(val reason: PointsRefusal, val maxPoints: Long?) : Exception("points refused: $reason")

/** 078 — the one window chosen for an order: a slot ON A DAY (yyyy-mm-dd, Melbourne). */
data class ChosenWindow(val slotId: String, val date: String)

/**
 * 078 — one window a shopper may choose, on one day. ⚠ No capacity and no "full": a window that is
 * taken is simply not here. [fee] is the order's delivery charge with it chosen; [surchargeAmount]
 * what it adds over a plain later day ("0.00" when nothing).
 */
data class EffyWindow(
    val slotId: String,
    val date: String,
    val startAt: String,
    val endAt: String,
    /** After this it can no longer be chosen. */
    val cutoffAt: String,
    val surchargeAmount: String,
    val fee: DeliveryFee,
)

/** Why a day has nothing to choose. A later day is only ever [Full]. */
enum class EffyDayClosed { NotDeliveryDay, Closed, Full }

/** One day on offer: today (under "Same-day delivery") or a following delivery day ("Standard delivery"). */
data class EffyDay(
    val date: String,
    val today: Boolean,
    val windows: List<EffyWindow>,
    val closedReason: EffyDayClosed?,
)

/** Why no day has a window. The shopper reads one sentence for both. */
enum class WindowsUnavailable { NoWindows, NoneDefined }

/**
 * 078 — the windows of the new delivery model: ONE for the whole order.
 *
 * ⚠ WHICH CHECKOUT THIS IS, THE QUOTE SAYS. A quote that carries these is the new model; one that
 * does not is the 069 method / slot / day. Nothing in the app reads a switch of its own.
 */
data class EffyWindows(val days: List<EffyDay>, val unavailable: WindowsUnavailable?) {
    /** The chosen window as it is offered NOW; null when nothing is chosen or it is no longer offered. */
    fun find(chosen: ChosenWindow?): EffyWindow? =
        chosen?.let { c -> days.firstOrNull { it.date == c.date }?.windows?.firstOrNull { it.slotId == c.slotId } }

    /** 0 for today, 1 for the first later day… -1 when the date is not offered. */
    fun dayOffset(date: String): Int = days.indexOfFirst { it.date == date }
}

/** 079 — who delivers an order. One per order, whatever number of suppliers fill it. */
enum class DeliveryType { EFFY, COURIER }

/**
 * 079 — what a courier order is told and charged. There is NOTHING to choose: no window, no day.
 *
 * ⚠ [estimate] is the business's text ("2–4 business days") and is an ESTIMATE: it is only ever
 * printed through `courierLines` (DeliveryTypeWords.kt), which says so.
 *
 * [noWindowLeft]: the address IS one Effy delivers to, but no window is left and the business sends
 * such an order by courier — the shopper is told there are no windows FIRST, then offered this.
 */
data class CourierDelivery(val estimate: String, val fee: DeliveryFee, val noWindowLeft: Boolean)

/** 079 — who delivers a PLACED order, and a courier's timeframe as it was sold. */
data class OrderDelivery(
    val type: DeliveryType,
    val courierEstimate: String?,
    val tracking: OrderTracking? = null,
    /** 081 — the latest move by back-office, and what the customer received; null when never moved. */
    val moved: OrderDeliveryMove? = null,
)

/** 081 — back-office moved the order to [to]; [compensation] is null when nothing was given. */
data class OrderDeliveryMove(val to: DeliveryType, val compensation: CustomerCompensation?)

/** 081 — what a customer received for a move to courier. [amount] is a wire amount ("2.50"). */
sealed interface CustomerCompensation {
    data class Points(val amount: String, val points: Int) : CustomerCompensation
    data class Refund(val amount: String) : CustomerCompensation
}

/** 080 — how a customer follows a courier order: one link, or "sent by email" for several parcels. */
sealed interface OrderTracking {
    data class Link(val url: String, val courierName: String) : OrderTracking
    data object ByEmail : OrderTracking
}

/**
 * The delivery quote for a chosen address, shown BEFORE payment. When [serviced] is false nobody
 * delivers there. A serviced address answers exactly one of two things (083): [effyWindows] — the
 * windows to choose from — or [courier].
 *
 * ⚠ ONE FEE FOR THE ORDER (077), and nothing here says how the order splits across suppliers.
 */
data class DeliveryQuote(
    val serviced: Boolean,
    /** 074 — the shopper's spendable points; null when they have none. */
    val points: CheckoutPoints? = null,
    /** 077 — how much more the basket needs for free delivery; null when unset or reached. */
    val freeDeliveryRemainingAmount: String? = null,
    /** Set exactly when Effy delivers: today and the next delivery days, and the windows open on each (078). */
    val effyWindows: EffyWindows? = null,
    /** Set exactly when a courier delivers the order (079); then there is nothing to choose. */
    val courier: CourierDelivery? = null,
) {
    /**
     * 079 — who delivers the order this quote is for. ⚠ THE QUOTE SAYS, and the same value is sent
     * back on the intent — the same rule as customer-web's `deliveryTypeOf`.
     */
    val deliveryType: DeliveryType?
        get() = when {
            !serviced -> null
            courier != null -> DeliveryType.COURIER
            effyWindows != null -> DeliveryType.EFFY
            else -> null
        }

    /**
     * 077 — the delivery charge for what is chosen: the courier's fee, or the chosen window's. Null
     * until a window is chosen — nothing to show yet.
     * ⚠ The same rule as customer-web's `chosenFee`; the server re-prices and refuses a mismatch.
     */
    fun feeFor(window: ChosenWindow?): DeliveryFee? {
        if (!serviced) return null
        // 079 — a courier delivers: ONE fee, already decided, whatever else is (not) chosen.
        if (courier != null) return courier.fee
        return effyWindows?.find(window)?.fee
    }

    companion object {
        val Unserviced = DeliveryQuote(serviced = false)
    }
}

/** Why the server refused a checkout over the delivery choice (069). */
enum class DeliveryChoiceRefusal {
    SlotRequired, SlotUnavailable, DateUnavailable, NoWindowsAvailable,

    /** 079 — who delivers is not what the screen showed. Nothing was written or charged. */
    DeliveryTypeChanged,
}

/**
 * The checkout was refused because the window the shopper chose cannot be honoured (069 FR-009).
 * Nothing has been charged and no payment exists. [quote] is what is on offer NOW, when the server
 * sent it.
 *
 * ⚠ A refusal never substitutes a window or a day. The shopper chooses again.
 */
class DeliveryChoiceRefused(
    val reason: DeliveryChoiceRefusal,
    val quote: DeliveryQuote?,
) : Exception("delivery choice refused: $reason")

interface CheckoutRepository {
    /** Create/locate the pending order + PaymentIntent for the chosen address. */
    suspend fun createIntent(order: PlaceOrder): CheckoutIntent
    suspend fun confirm(orderId: String): Boolean
    /** 047: quote delivery (serviceability + fee + same-day availability) for a chosen address. */
    suspend fun quote(addressId: String): DeliveryQuote
}

/**
 * CreateIntent (051) — create the pending order + PaymentIntent, and STOP.
 *
 * ⚠ This is what the retired `PayForOrder` fused into one call. It could not stay fused: the in-app element
 * renders inside Effy's own screen, so the intent must exist BEFORE that screen draws, and confirmation
 * happens later when the shopper presses Effy's pay button. One call that created an intent and
 * presented a sheet was only possible while the sheet was a modal the app did not own.
 */
class CreateIntent(private val checkout: CheckoutRepository) {
    suspend operator fun invoke(order: PlaceOrder): CheckoutIntent = checkout.createIntent(order)
}

/**
 * ConfirmOrder (051) — the idempotent fallback finaliser, called the moment the element reports a
 * completed payment.
 *
 * ⚠ The WEBHOOK is authoritative (019 R4); this covers its lag, and a failure here is deliberately
 * swallowed by the caller. A shopper who has paid must never be shown a failure because a best-effort
 * confirmation call did not land (FR-039).
 */
class ConfirmOrder(private val checkout: CheckoutRepository) {
    suspend operator fun invoke(orderId: String): Boolean = checkout.confirm(orderId)
}

/** QuoteDelivery (047) — the use case the ViewModel calls when the shipping address is chosen/changed. */
class QuoteDelivery(private val checkout: CheckoutRepository) {
    suspend operator fun invoke(addressId: String): DeliveryQuote = checkout.quote(addressId)
}

data class OrderSummary(
    val id: String,
    val orderNumber: String,
    val status: String,
    val itemCount: Int,
    val grandTotalAmount: String,
    val currency: String,
    /** 079 — who delivers it; null for an order placed before orders had a delivery type. */
    val delivery: OrderDelivery? = null,
)

interface OrdersRepository {
    suspend fun get(orderId: String): Receipt
    suspend fun list(): List<OrderSummary>
}

class GetReceipt(private val orders: OrdersRepository) {
    suspend operator fun invoke(orderId: String): Receipt = orders.get(orderId)
}

class ListOrders(private val orders: OrdersRepository) {
    suspend operator fun invoke(): List<OrderSummary> = orders.list()
}

/**
 * Ask the platform to send a paid order's receipt again (052 US4).
 *
 * ⚠ A use case, not a repository call from the ViewModel — the domain layer depends on nothing and the
 * data layer implements it (Principle VI).
 */
fun interface ResendReceipt {
    suspend operator fun invoke(orderId: String): ResendReceiptResult
}

/**
 * What came of a resend request.
 *
 * ⚠ [Unavailable] deliberately merges "not yours", "no such order" and "not paid". The server refuses
 * the first two IDENTICALLY so the route cannot be used to discover which order ids are real
 * (FR-029); giving them separate cases here would invite a UI that tries to tell them apart.
 */
enum class ResendReceiptResult { Queued, RateLimited, Unavailable, Failed }



/**
 * Cancelling an order (055 US2, FR-012).
 *
 * ⚠ CANCELLING *IS* REFUNDING on this platform (research R3). The money was captured when the order
 * was paid, so there is no "cancel before we charge you" — there is only returning what was taken.
 * The wording on the screen has to say that, because a shopper who thinks nothing was charged will
 * not look for a refund that has not arrived.
 */
fun interface CancelOrder {
    suspend operator fun invoke(orderId: String): CancelOrderResult
}

sealed interface CancelOrderResult {
    /** Cancelled, and the money is on its way back. ⚠ NOT "refunded" — the bank has not moved it yet. */
    data class Cancelled(val amount: String) : CancelOrderResult

    /**
     * Somebody has already started preparing it.
     *
     * ⚠ This is a FACT ABOUT THE ORDER, not a failure of the request, and the difference is the whole
     * of the wording: staff can still cancel it, so the screen must point at a human rather than say
     * the order can never be cancelled (FR-018).
     */
    data object AlreadyBeingPrepared : CancelOrderResult

    /** The session expired, or this is not the caller's order. */
    data object NotAllowed : CancelOrderResult

    data object Failed : CancelOrderResult
}


/**
 * Asking for a refund (055 US3, FR-005r).
 *
 * ⚠ IT MOVES NO MONEY AND MUST NOT READ AS A DECISION. A form that withdrew money on submission would
 * let anyone refund their own order by describing a problem. This records an ASK; a person decides it.
 *
 * ⚠ IT REPLACES "Get help" pointing at the generic 046 feedback form WITH NO ORDER ATTACHED — a
 * shopper describing a missing item landed in an inbox where nobody could see which order they meant.
 */
fun interface RequestRefund {
    suspend operator fun invoke(orderId: String, input: RefundRequestInput): RefundRequestResult
}

data class RefundRequestInput(
    val message: String,
    /**
     * ⚠ OPTIONAL, and they are LINE ids rather than product ids. An order can carry the same product
     * on two lines, so a product id cannot identify one — and passing one where the other is expected
     * does not error: the server's join matches nothing and every named item is silently dropped.
     */
    val items: List<RefundRequestItem> = emptyList(),
)

data class RefundRequestItem(val orderItemId: String, val quantity: Int)

sealed interface RefundRequestResult {
    /** ⚠ Received, NOT granted. Nothing here may be rendered as a promise of money. */
    data object Received : RefundRequestResult

    /** They have already asked about this order and nobody has answered yet. */
    data object AlreadyOpen : RefundRequestResult

    data object NotAllowed : RefundRequestResult
    data object Failed : RefundRequestResult
}
