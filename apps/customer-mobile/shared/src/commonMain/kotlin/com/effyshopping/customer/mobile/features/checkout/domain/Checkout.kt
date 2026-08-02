package com.effyshopping.customer.mobile.features.checkout.domain

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.payment.PaymentDriver
import com.effyshopping.customer.mobile.core.payment.PaymentResult

/**
 * Checkout domain (019 US3). The server owns the amount + the PaymentIntent; the app creates the intent,
 * presents the native PaymentSheet via the [PaymentDriver], and reads the webhook-authoritative receipt.
 */

data class CheckoutIntent(
    val orderId: String,
    val orderNumber: String,
    val clientSecret: String,
    // The backend's publishable-key echo (config.go marks it a convenience). Retained to mirror the wire,
    // but the pay flow uses the client's OWN key (AppConfig.stripePublishableKey) — see [PayForOrder].
    val publishableKey: String,
    val grandTotalAmount: String,
    val currency: String,
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
    val deliveryFeeAmount: String,
    /**
     * 027 — what a promotional code took off, as computed at PAYMENT, and the code itself. Read from the
     * ORDER rather than re-derived, so a receipt explains itself years later even if the code has since
     * changed or been disabled (FR-049). Null/"0.00" when none was used.
     */
    val discountAmount: String? = null,
    val promoCode: String? = null,
    val grandTotalAmount: String,
    val currency: String,
) {
    /** True when billing == shipping (the common case) → "Billing: same as shipping" (FR-016). */
    val billingSameAsShipping: Boolean get() = billingAddressLine == null
}

interface CheckoutRepository {
    /** Per-package delivery quote for the cart + address (021 US1). */
    suspend fun quote(addressId: String): DeliveryQuote

    /**
     * Create/locate the pending order + PaymentIntent from the customer's per-package [PlaceOrder]
     * (021 US3). Throws [com.effyshopping.customer.mobile.core.error.AppException] with
     * [com.effyshopping.customer.mobile.core.error.AppError.RequoteRequired] on a 409 (stale quote /
     * lapsed same-day / withdrawn method) so the caller re-quotes (FR-011a).
     */
    suspend fun createIntent(order: PlaceOrder): CheckoutIntent
    suspend fun confirm(orderId: String): Boolean
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

/** The outcome of the pay flow surfaced to the ViewModel. */
sealed interface PayOutcome {
    data class Placed(val orderId: String) : PayOutcome
    data object Canceled : PayOutcome

    /** The captured quote went stale (021 FR-011a) — the ViewModel re-quotes and shows the new amounts. */
    data object Requote : PayOutcome
    data class Failed(val message: String) : PayOutcome
}

/**
 * PayForOrder (T056, extended 021 T045) — the checkout orchestration: create the intent from the
 * per-package [PlaceOrder], present the native sheet, and on completion best-effort confirm (the webhook
 * is authoritative; confirm covers local-dev lag). A stale quote (409) surfaces as [PayOutcome.Requote].
 *
 * [publishableKey] is the client's OWN build-time Stripe publishable key (AppConfig.stripePublishableKey),
 * not the server's echo on the intent — each client carries its own (019 R3; config.go marks the backend
 * echo a convenience). The `sk_…` secret never reaches the client; this key only presents the sheet.
 */
class PayForOrder(
    private val checkout: CheckoutRepository,
    private val payments: PaymentDriver,
    private val publishableKey: String,
) {
    suspend operator fun invoke(order: PlaceOrder): PayOutcome {
        val intent = try {
            checkout.createIntent(order)
        } catch (e: AppException) {
            if (e.error is AppError.RequoteRequired) return PayOutcome.Requote else throw e
        }
        return when (val result = payments.presentPaymentSheet(intent.clientSecret, publishableKey)) {
            PaymentResult.Completed -> {
                runCatching { checkout.confirm(intent.orderId) }
                PayOutcome.Placed(intent.orderId)
            }
            PaymentResult.Canceled -> PayOutcome.Canceled
            is PaymentResult.Failed -> PayOutcome.Failed(result.message)
        }
    }
}

class GetReceipt(private val orders: OrdersRepository) {
    suspend operator fun invoke(orderId: String): Receipt = orders.get(orderId)
}

class ListOrders(private val orders: OrdersRepository) {
    suspend operator fun invoke(): List<OrderSummary> = orders.list()
}
