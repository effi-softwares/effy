package com.effyshopping.customer.mobile.core.payment

/**
 * The outcome of a payment attempt. [Completed] means the provider accepted it, not that it settled: the
 * webhook is authoritative for the order; this only drives the UI.
 */
sealed interface PaymentResult {
    /** The customer completed payment (subject to webhook confirmation). */
    data object Completed : PaymentResult

    /** The customer backed out without paying. Nothing was charged. */
    data object Canceled : PaymentResult

    /** Payment failed (declined / error); [message] is safe to show a shopper. */
    data class Failed(val message: String) : PaymentResult
}
