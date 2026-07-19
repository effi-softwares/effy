package com.effyshopping.customer.mobile.features.checkout.domain

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
    val publishableKey: String,
    val grandTotalAmount: String,
    val currency: String,
)

data class Address(
    val id: String,
    val recipientName: String,
    val line1: String,
    val line2: String?,
    val city: String,
    val region: String?,
    val postalCode: String,
    val country: String,
    val isDefault: Boolean,
)

data class NewAddress(
    val recipientName: String,
    val line1: String,
    val line2: String?,
    val city: String,
    val region: String?,
    val postalCode: String,
)

data class ReceiptItem(
    val productName: String,
    val quantity: Int,
    val unitPriceAmount: String,
    val lineSubtotalAmount: String,
)

data class Receipt(
    val id: String,
    val orderNumber: String,
    val paid: Boolean,
    val items: List<ReceiptItem>,
    val recipientName: String,
    val addressLine: String,
    val itemSubtotalAmount: String,
    val deliveryFeeAmount: String,
    val grandTotalAmount: String,
    val currency: String,
)

interface CheckoutRepository {
    suspend fun createIntent(addressId: String): CheckoutIntent
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

interface AddressRepository {
    // Named distinctly from OrdersRepository.list() so one class may implement both (Kotlin forbids
    // same-name overrides with different return types).
    suspend fun listAddresses(): List<Address>
    suspend fun create(input: NewAddress): Address
}

/** The outcome of the pay flow surfaced to the ViewModel. */
sealed interface PayOutcome {
    data class Placed(val orderId: String) : PayOutcome
    data object Canceled : PayOutcome
    data class Failed(val message: String) : PayOutcome
}

/**
 * PayForOrder (T056) — the checkout orchestration: create the intent, present the native sheet, and on
 * completion best-effort confirm (the webhook is authoritative; confirm covers local-dev lag).
 */
class PayForOrder(
    private val checkout: CheckoutRepository,
    private val payments: PaymentDriver,
) {
    suspend operator fun invoke(addressId: String): PayOutcome {
        val intent = checkout.createIntent(addressId)
        return when (val result = payments.presentPaymentSheet(intent.clientSecret, intent.publishableKey)) {
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

class ListAddresses(private val repo: AddressRepository) {
    suspend operator fun invoke(): List<Address> = repo.listAddresses()
}

class CreateAddress(private val repo: AddressRepository) {
    suspend operator fun invoke(input: NewAddress): Address = repo.create(input)
}
