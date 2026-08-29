package com.effyshopping.customer.mobile.features.checkout.domain

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
)

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
 * ⚠ DATES, NOT TIMES. The underlying columns are `date`; the platform has no delivery time window and
 * cannot derive one. Never render a time from this.
 *
 * ⚠ It carries no shop reference of any kind (FR-009).
 */
data class ArrivalEstimate(
    val method: String,
    val promisedFrom: String?,
    val promisedTo: String?,
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
     * 027 — what a promotional code took off, as computed at PAYMENT, and the code itself. Read from the
     * ORDER rather than re-derived, so a receipt explains itself years later even if the code has since
     * changed or been disabled (FR-049). Null/"0.00" when none was used.
     */
    val discountAmount: String? = null,
    val promoCode: String? = null,
    val grandTotalAmount: String,
    val currency: String,
    /** 052 — when the order was placed, pre-formatted by the mapper. Empty when unknown. */
    val placedAt: String = "",
    /** 052 — server-derived progress (FR-008). */
    val stage: OrderStage = OrderStage.Confirmed,
    /** 052 — null when never captured: a pre-052 order, or a failed post-commit capture. */
    val paymentMethod: PaymentMethodSummary? = null,
    /** 052 — one entry per package. More than one means the order arrives in more than one delivery. */
    val arrivalEstimates: List<ArrivalEstimate> = emptyList(),
) {
    /** True when billing == shipping (the common case) → "Billing: same as shipping" (FR-016). */
    val billingSameAsShipping: Boolean get() = billingAddressLine == null
}

/**
 * What placement needs.
 *
 * ⚠ It used to carry per-package delivery selections and an exclusion set. Delivery zones, quotes and
 * fees were withdrawn from the platform, so there is nothing per-package to choose and nothing to
 * exclude — every item in the cart is charged, and the shopper picks only an address.
 */
data class PlaceOrder(
    val addressId: String,
    /** Set only when the shopper diverged from shipping (023). Null means "same as shipping". */
    val billingAddressId: String? = null,
    /**
     * 047: the shopper's order-level delivery preference. Applied per package where same-day is offered,
     * standard elsewhere (FR-044). The client never sends a fee — the server prices the method (SC-004).
     */
    val deliveryMethod: DeliveryMethod = DeliveryMethod.STANDARD,
)

/** The two delivery methods (047). Same-day is always priced ≥ standard. */
enum class DeliveryMethod { STANDARD, SAME_DAY }

/**
 * The delivery quote for a chosen address (047 US1/US2), shown BEFORE payment. When [serviced] is false
 * there are no packages and one reason — we don't deliver there yet (FR-002). [sameDayAvailable] is true
 * only when EVERY package can do same-day, so the shopper — who never sees packages (hidden fulfilment) —
 * is offered one honest order-level choice. Fees are GST-inclusive, snapped-up 2-dp decimal strings.
 */
data class DeliveryQuote(
    val serviced: Boolean,
    val sameDayAvailable: Boolean,
    val standardTotalAmount: String,
    val sameDayTotalAmount: String?,
) {
    companion object {
        val Unserviced = DeliveryQuote(serviced = false, sameDayAvailable = false, standardTotalAmount = "0.00", sameDayTotalAmount = null)
    }
}

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

