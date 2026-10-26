package com.effyshopping.customer.mobile.features.checkout.domain

import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.DeliveryInstructions
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException

/**
 * Checkout domain (019 US3, reshaped by 051). The server owns the amount + the PaymentIntent; checkout
 * creates the intent and stops. Paying is the payment screen's job, and the receipt is
 * webhook-authoritative.
 */

data class CheckoutIntent(
    val orderId: String,
    val orderNumber: String,
    val clientSecret: String,
    // The backend's publishable-key echo (config.go marks it a convenience). Retained to mirror the wire,
    // but the pay flow uses the client's own key (AppConfig.stripePublishableKey) — see `PaymentViewModel`.
    val publishableKey: String,
    val grandTotalAmount: String,
    val currency: String,
    /**
     * Authorizes the provider-owned saved-card list for this shopper. Null for a shopper who has
     * never paid (they have no provider record yet), which is not an error.
     */
    val customerSessionSecret: String? = null,
    /**
     * The provider customer the session belongs to. Required beside the secret: both mobile
     * SDKs take them together, and a session without its id cannot be attached.
     */
    val customerId: String? = null,
    /**
     * The billing details the client attaches at confirmation (the payment screen asks for no country,
     * postcode or name), derived by the server from the confirmed address.
     */
    val billingDetails: CheckoutBillingDetails? = null,
    /**
     * Until when the order's same-day place is held (ISO instant), or null when nothing is
     * same-day. Once this has passed the place may have gone to someone else, and the payment
     * screen must not confirm: the intent call is the last moment the server can refuse before the
     * shopper is charged.
     */
    val slotHeldUntil: String? = null,
    /** The points this order uses, and what is left for the card. */
    val pointsUsed: Long = 0,
    val pointsAmount: String? = null,
    val cardAmount: String? = null,
    /**
     * True when points covered everything: the order is already paid, there is no card step and
     * [clientSecret] is empty. The app goes straight to the receipt.
     */
    val paidWithPoints: Boolean = false,
) {
    /** What the card is charged: the total less any points. */
    val amountForCard: String get() = cardAmount ?: grandTotalAmount
}

/** The billing details Effy attaches on the shopper's behalf. */
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
     * This line's own id. Not interchangeable with [productId]: an order can carry one product on two
     * lines, and naming a product where a line is expected silently matches nothing.
     */
    val orderItemId: String,
    /**
     * The product, so a shopper can save it from a past order. It may since be archived or deleted (the
     * line renders from its snapshot), so saving can answer 404, and the control says so.
     */
    val productId: String,
    val productName: String,
    /** The size as it was sold ("1 kg"); null for a product sold one way. */
    val variantLabel: String? = null,
    /** Sold to adults only: the line says 18+ (101). */
    val ageRestricted: Boolean = false,
    val quantity: Int,
    val unitPriceAmount: String,
    val lineSubtotalAmount: String,
    /**
     * The product's primary image, or null.
     *
     * Decoration only, and never a carrier of meaning. A line renders complete without it and
     * nothing on the receipt may be gated on its presence. Every other field here is the order's own
     * snapshot; this one resolves against the live catalogue, which is why it can go missing.
     */
    val imageUrl: String? = null,
)

/**
 * The customer-facing progress stage, derived by the server from every portion and never recomputed here.
 * [Unknown] lets a stage added later degrade to "we cannot say" rather than crash a receipt.
 */
enum class OrderStage { Confirmed, Packing, OnTheWay, Delivered, Unknown }

/**
 * How the order was paid.
 *
 * No card data beyond [last4], ever. There is no field here for a card number, an expiry or a
 * cardholder name, and none may be added.
 */
data class PaymentMethodSummary(
    val type: String,
    val brand: String?,
    val last4: String?,
)

/**
 * When one package is expected, as shown at checkout. [promisedFrom]/[promisedTo] are the delivery day
 * (yyyy-mm-dd); [windowStart]/[windowEnd] the window sold, as ISO instants (null for a day with no time,
 * "as soon as possible" or courier). A time is shown only from a window present; nothing is derived. Say it
 * through [DeliveryWindowText.formatArrival]. No shop reference.
 */
data class ArrivalEstimate(
    val method: String,
    val promisedFrom: String?,
    val promisedTo: String?,
    val windowStart: String? = null,
    val windowEnd: String? = null,
)

/**
 * The receipt. [recipientName] + [addressLine] are the shipping snapshot (always shown in full);
 * [billingRecipientName] + [billingAddressLine] the billing snapshot: both null means "same as shipping"
 * (said in words, not a repeated address).
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
    /** The delivery fee, so the receipt's lines add up. Null/"0.00" when there is none. */
    val deliveryFeeAmount: String? = null,
    /**
     * The same charge as the lines the shopper was sold (delivery, window surcharge, small-order
     * fee, free delivery). Stored with the order and never re-priced. Null on an order placed before
     * 077, which shows the single [deliveryFeeAmount] row instead.
     */
    val deliveryFee: DeliveryFee? = null,
    /**
     * What a promotional code took off, as computed at payment, and the code itself. Read from the
     * order rather than re-derived, so a receipt explains itself years later even if the code has since
     * changed or been disabled. Null/"0.00" when none was used.
     */
    val discountAmount: String? = null,
    val promoCode: String? = null,
    /** Each promotion as sold: its headline, code and what it took off goods. */
    val promotions: List<ReceiptPromotion> = emptyList(),
    val deliveryDiscountAmount: String? = null,
    /**
     * What the shopper told the driver when the order was placed. Null when they said nothing,
     * which includes every order placed before 066 — and the receipt then shows nothing: no heading,
     * no placeholder.
     */
    val deliveryInstructions: DeliveryInstructions? = null,
    val grandTotalAmount: String,
    val currency: String,
    /**
     * Who delivers the order, and a courier's timeframe as it was sold. For a courier order
     * [arrivalEstimates] is empty: say it through `deliverySummary`, never from a package's own method.
     */
    val delivery: OrderDelivery,
    /** When the order was placed, pre-formatted by the mapper. Empty when unknown. */
    val placedAt: String = "",
    /** Server-derived progress. */
    val stage: OrderStage = OrderStage.Confirmed,
    /** Null when never captured: a pre-052 order, or a failed post-commit capture. */
    val paymentMethod: PaymentMethodSummary? = null,
    /** One entry per package. More than one means the order arrives in more than one delivery. */
    val arrivalEstimates: List<ArrivalEstimate> = emptyList(),
    /**
     * May the shopper still cancel this themselves?
     *
     * Server-derived, like [stage] beside it, and for the same reason: a second implementation of
     * one rule diverges silently because both sides still render something. This screen never works
     * it out from [stage] or the portions.
     *
     * `false` does not mean "never cancellable" — staff can, right up until the order leaves the
     * shop. Any wording built on this must leave that door open.
     */
    val cancellable: Boolean = false,
    /** Every refund on this order, newest first; empty renders nothing (the server omits the fields). */
    val refunds: List<CustomerRefund> = emptyList(),
    /** What has actually been returned or is on its way. "0.00" when none. */
    val refundedTotal: String = "0.00",
    /**
     * What the shopper is out of pocket after refunds.
     *
     * Not a correction to [grandTotalAmount] — that is what was charged, a historical
     * record. A receipt that rewrote itself after a refund could not be reconciled against a bank
     * statement, which is the one thing a receipt is for.
     */
    val amountPaidAfterRefunds: String = "",
    /** Derived by the server from the totals, never a stored flag. */
    val fullyRefunded: Boolean = false,
    /** How the order was paid when points were part of it. Null when none were used. */
    val paymentSplit: PaymentSplit? = null,
) {
    /** True when billing == shipping (the common case) → "Billing: same as shipping". */
    val billingSameAsShipping: Boolean get() = billingAddressLine == null
}

/**
 * One refund, as the shopper sees it.
 *
 * Three states and no failure text. Five internal states collapse to three because a shopper
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
 * The client never sends a fee — the server prices the order — and never anything
 * about how the order splits across suppliers.
 */
data class PlaceOrder(
    val addressId: String,
    /** Set only when the shopper diverged from shipping. Null means "same as shipping". */
    val billingAddressId: String? = null,
    /**
     * What the shopper tells the driver for this order, or null when they said nothing.
     *
     * The server stores exactly this. It never reads the address's saved default — prefilling from
     * that is this app's job — which is why editing an address later cannot change a placed order.
     */
    val deliveryInstructions: DeliveryInstructions? = null,
    /**
     * The one window chosen for the order when Effy delivers; null for a courier order, which
     * has nothing to choose. Never substituted: a window that has gone is a [DeliveryChoiceRefused].
     */
    val deliveryWindow: ChosenWindow? = null,
    /**
     * "as soon as possible": sent instead of [deliveryWindow]. The server puts the order on the
     * earliest day it can; the shopper is told the estimate, never the day.
     */
    val asap: Boolean = false,
    /**
     * Who delivers the order, as this screen is showing it ([DeliveryQuote.deliveryType]). A
     * courier order is refused without it, and so is one that says "courier" for an address Effy now
     * delivers to ([DeliveryChoiceRefusal.DeliveryTypeChanged]) — nobody pays a courier fee for a
     * screen that showed Effy's windows.
     */
    val deliveryType: DeliveryType? = null,
    /** Whole points to pay with; 0 for none. The server re-decides the split and refuses rather than changes it. */
    val pointsToUse: Long = 0,
    /**
     * The delivery total this screen is showing. If the server would now charge another, it
     * refuses ([DeliveryFeeChanged]) and nothing is written or charged. Null sends no check.
     */
    val shownDeliveryAmount: String? = null,
)

/** One line of what delivery costs. Only [DeliveryFeeLineKind.FreeDelivery] is negative. */
enum class DeliveryFeeLineKind { Delivery, WindowSurcharge, SmallOrder, FreeDelivery }

data class DeliveryFeeLine(val kind: DeliveryFeeLineKind, val amount: String)

/**
 * What the shopper pays for delivery, in lines that sum to [totalAmount]. Nothing else: no
 * distance, weight or plan ever reaches the app.
 */
data class DeliveryFee(
    val lines: List<DeliveryFeeLine>,
    val totalAmount: String,
    /** What this shopper's delivery promotions take off this fee; null when none. */
    val promotionAmount: String? = null,
) {
    val free: Boolean get() = lines.any { it.kind == DeliveryFeeLineKind.FreeDelivery }
}

/**
 * The delivery total changed between the quote and the pay button (a new fee plan went live,
 * or the basket crossed a threshold). Nothing was charged. [quote] is what is on offer now.
 */
class DeliveryFeeChanged(val quote: DeliveryQuote?) : Exception("delivery fee changed")

/** An offer changed, or its last use went, between the cart and the pay button. Nothing was charged. */
class PromotionsChanged : Exception("promotions changed")

/** Points as a way of paying, on a receipt: never a discount line. */
data class PaymentSplit(val pointsUsed: Long, val pointsAmount: String, val cardAmount: String)

/** What the shopper can spend at checkout. Absent from the quote when they have none. */
data class CheckoutPoints(val usable: Long, val centsPerPoint: Long) {
    /** "$12.50" worth, as a 2-dp string. */
    val valueAmount: String get() {
        val c = usable * centsPerPoint
        return "${c / 100}.${(c % 100).toString().padStart(2, '0')}"
    }
}

/** Why the server refused the points asked for. Nothing was charged. */
enum class PointsRefusal { BalanceChanged, ExceedTotal, CardRemainderTooSmall, PaymentInProgress }

/** A points refusal, with the most points the server would accept when it said. */
class PointsRefused(val reason: PointsRefusal, val maxPoints: Long?) : Exception("points refused: $reason")

/** The one window chosen for an order: a slot ON A DAY (yyyy-mm-dd, Melbourne). */
data class ChosenWindow(val slotId: String, val date: String)

/**
 * One window a shopper may choose, on one day. No capacity and no "full": a window that is
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
    /**
     * This day sold with no time (the business's "Any time" window). Chosen like any window; the
     * order is then promised the day. Always null for today.
     */
    val anyTime: EffyWindow? = null,
)

/** "as soon as possible": the business's estimate and the one fee. No day. */
data class EffyAsap(val estimate: String, val fee: DeliveryFee)

/** Why no day has a window. The shopper reads one sentence for both. */
enum class WindowsUnavailable { NoWindows, NoneDefined }

/** The Effy windows for the whole order, as the quote offers them. */
data class EffyWindows(val days: List<EffyDay>, val unavailable: WindowsUnavailable?, val asap: EffyAsap? = null) {
    /**
     * The chosen window as it is offered now — a timed one, or the day's Any time one; null when
     * nothing is chosen or it is no longer offered.
     */
    fun find(chosen: ChosenWindow?): EffyWindow? =
        chosen?.let { c ->
            val day = days.firstOrNull { it.date == c.date }
            day?.anyTime?.takeIf { it.slotId == c.slotId } ?: day?.windows?.firstOrNull { it.slotId == c.slotId }
        }

    /** Whether [chosen] is a day's Any time window: the order is then promised the day. */
    fun isAnyTime(chosen: ChosenWindow?): Boolean =
        chosen != null && days.firstOrNull { it.date == chosen.date }?.anyTime?.slotId == chosen.slotId

    /** 0 for today, 1 for the first later day… -1 when the date is not offered. */
    fun dayOffset(date: String): Int = days.indexOfFirst { it.date == date }
}

/** Who delivers an order. One per order, whatever number of suppliers fill it. */
enum class DeliveryType { EFFY, COURIER }

/** What an Effy order was sold: a time, a day with no time, or "as soon as possible". */
enum class DeliveryPromise { WINDOW, DAY, ASAP }

/**
 * What a courier order is told and charged. There is nothing to choose: no window, no day.
 *
 * [estimate] is the business's text ("2–4 business days") and is an estimate: it is only ever
 * printed through `courierLines` (DeliveryTypeWords.kt), which says so.
 *
 * [noWindowLeft]: the address IS one Effy delivers to, but no window is left and the business sends
 * such an order by courier — the shopper is told there are no windows first, then offered this.
 */
data class CourierDelivery(val estimate: String, val fee: DeliveryFee, val noWindowLeft: Boolean)

/** Who delivers a placed order, and a courier's timeframe as it was sold. */
data class OrderDelivery(
    val type: DeliveryType,
    val courierEstimate: String?,
    /** What an Effy order was sold; null for courier and orders from before 085 (a window). */
    val promise: DeliveryPromise? = null,
    /** The estimate an "as soon as possible" order was sold with. */
    val asapEstimate: String? = null,
    val tracking: OrderTracking? = null,
    /** The latest move by back-office, and what the customer received; null when never moved. */
    val moved: OrderDeliveryMove? = null,
)

/** Back-office moved the order to [to]; [compensation] is null when nothing was given. */
data class OrderDeliveryMove(val to: DeliveryType, val compensation: CustomerCompensation?)

/** What a customer received for a move to courier. [amount] is a wire amount ("2.50"). */
sealed interface CustomerCompensation {
    data class Points(val amount: String, val points: Int) : CustomerCompensation
    data class Refund(val amount: String) : CustomerCompensation
}

/** How a customer follows a courier order: one link, or "sent by email" for several parcels. */
sealed interface OrderTracking {
    data class Link(val url: String, val courierName: String) : OrderTracking
    data object ByEmail : OrderTracking
}

/**
 * The delivery quote for a chosen address, shown before payment. When [serviced] is false nobody
 * delivers there. A serviced address answers exactly one of two things: [effyWindows] — the
 * windows to choose from — or [courier].
 *
 * One fee for the order, and nothing here says how the order splits across suppliers.
 */
data class DeliveryQuote(
    val serviced: Boolean,
    /** The shopper's spendable points; null when they have none. */
    val points: CheckoutPoints? = null,
    /** How much more the basket needs for free delivery; null when unset or reached. */
    val freeDeliveryRemainingAmount: String? = null,
    /** Set exactly when Effy delivers: today and the next delivery days, and the windows open on each. */
    val effyWindows: EffyWindows? = null,
    /** Set exactly when a courier delivers the order; then there is nothing to choose. */
    val courier: CourierDelivery? = null,
) {
    /**
     * Who delivers the order this quote is for. The quote says, and the same value is sent
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
     * The delivery charge for what is chosen: the courier's fee, or the chosen window's. Null
     * until a window is chosen — nothing to show yet.
     * The same rule as customer-web's `chosenFee`; the server re-prices and refuses a mismatch.
     */
    fun feeFor(window: ChosenWindow?, asap: Boolean = false): DeliveryFee? {
        if (!serviced) return null
        // A courier delivers: One fee, already decided, whatever else is (not) chosen.
        if (courier != null) return courier.fee
        // "as soon as possible" has one fee whatever day it lands on.
        if (asap) return effyWindows?.asap?.fee
        return effyWindows?.find(window)?.fee
    }

    companion object {
        val Unserviced = DeliveryQuote(serviced = false)
    }
}

/** Why the server refused a checkout over the delivery choice. */
enum class DeliveryChoiceRefusal {
    SlotRequired, SlotUnavailable, DateUnavailable, NoWindowsAvailable,

    /** Who delivers is not what the screen showed. Nothing was written or charged. */
    DeliveryTypeChanged,
}

/**
 * The checkout was refused because the window the shopper chose cannot be honoured.
 * Nothing has been charged and no payment exists. [quote] is what is on offer now, when the server
 * sent it.
 *
 * A refusal never substitutes a window or a day. The shopper chooses again.
 */
class DeliveryChoiceRefused(
    val reason: DeliveryChoiceRefusal,
    val quote: DeliveryQuote?,
) : Exception("delivery choice refused: $reason")

interface CheckoutRepository {
    /** Create/locate the pending order + PaymentIntent for the chosen address. */
    suspend fun createIntent(order: PlaceOrder): CheckoutIntent
    suspend fun confirm(orderId: String): Boolean
    /** Quote delivery (serviceability + fee + same-day availability) for a chosen address. */
    suspend fun quote(addressId: String): DeliveryQuote
}

/**
 * Create the pending order and its PaymentIntent, and stop: the in-app element draws inside Effy's
 * payment screen, so the intent must exist first, and confirmation follows on Effy's pay button.
 */
class CreateIntent(private val checkout: CheckoutRepository) {
    suspend operator fun invoke(order: PlaceOrder): CheckoutIntent = checkout.createIntent(order)
}

/**
 * ConfirmOrder — the idempotent fallback finaliser, called the moment the element reports a
 * completed payment.
 *
 * The webhook is authoritative; this covers its lag, and a failure here is deliberately
 * swallowed by the caller. A shopper who has paid must never be shown a failure because a best-effort
 * confirmation call did not land.
 */
class ConfirmOrder(private val checkout: CheckoutRepository) {
    suspend operator fun invoke(orderId: String): Boolean = checkout.confirm(orderId)
}

/** QuoteDelivery — the use case the ViewModel calls when the shipping address is chosen/changed. */
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
    /** Who delivers it. */
    val delivery: OrderDelivery,
    // 087 (Orders board) — read from fields the orders list has carried since 084/086. Every one is
    // optional: an order from before them degrades to the row it always had, never to an invented value.
    /** When it was placed (ISO). */
    val placedAt: String? = null,
    /** Where it is, server-derived (never recomputed here); null when the list did not say. */
    val stage: OrderStage? = null,
    /** The arrival it was sold, said through the same wording twins as the receipt. */
    val arrivals: List<ArrivalEstimate> = emptyList(),
    /** When the whole order had arrived (ISO); only once delivered. */
    val deliveredAt: String? = null,
    /** Up to a handful of item pictures; a null entry is an item with no picture. */
    val thumbnails: List<String?> = emptyList(),
    val fullyRefunded: Boolean = false,
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
 * Ask the platform to send a paid order's receipt again.
 *
 * A use case, not a repository call from the ViewModel — the domain layer depends on nothing and the
 * data layer implements it (Principle VI).
 */
fun interface ResendReceipt {
    suspend operator fun invoke(orderId: String): ResendReceiptResult
}

/**
 * What came of a resend request. [Unavailable] merges "not yours", "no such order" and "not paid": the
 * server refuses the first two identically so order ids cannot be probed.
 */
enum class ResendReceiptResult { Queued, RateLimited, Unavailable, Failed }

/**
 * Cancelling an order.
 *
 * Cancelling *IS* refunding on this platform. The money was captured when the order
 * was paid, so there is no "cancel before we charge you" — there is only returning what was taken.
 * The wording on the screen has to say that, because a shopper who thinks nothing was charged will
 * not look for a refund that has not arrived.
 */
fun interface CancelOrder {
    suspend operator fun invoke(orderId: String): CancelOrderResult
}

sealed interface CancelOrderResult {
    /** Cancelled, and the money is on its way back. Not "refunded" — the bank has not moved it yet. */
    data class Cancelled(val amount: String) : CancelOrderResult

    /**
     * Somebody has already started preparing it.
     *
     * This is a fact about the order, not a failure of the request, and the difference is the whole
     * of the wording: staff can still cancel it, so the screen must point at a human rather than say
     * the order can never be cancelled.
     */
    data object AlreadyBeingPrepared : CancelOrderResult

    /** The session expired, or this is not the caller's order. */
    data object NotAllowed : CancelOrderResult

    data object Failed : CancelOrderResult
}

/**
 * Asking for a refund, attached to the order. It moves no money and must not read as a decision: it
 * records an ask, and a person decides.
 */
fun interface RequestRefund {
    suspend operator fun invoke(orderId: String, input: RefundRequestInput): RefundRequestResult
}

data class RefundRequestInput(
    val message: String,
    /**
     * Optional, and they are line ids rather than product ids. An order can carry the same product
     * on two lines, so a product id cannot identify one — and passing one where the other is expected
     * does not error: the server's join matches nothing and every named item is silently dropped.
     */
    val items: List<RefundRequestItem> = emptyList(),
)

data class RefundRequestItem(val orderItemId: String, val quantity: Int)

sealed interface RefundRequestResult {
    /** Received, not granted. Nothing here may be rendered as a promise of money. */
    data object Received : RefundRequestResult

    /** They have already asked about this order and nobody has answered yet. */
    data object AlreadyOpen : RefundRequestResult

    data object NotAllowed : RefundRequestResult
    data object Failed : RefundRequestResult
}

/** One promotion on a receipt, as sold. */
data class ReceiptPromotion(val headline: String, val code: String?, val goodsAmount: String)
