package com.effyshopping.customer.mobile.core.payment

/**
 * The flat outcome of a payment attempt.
 *
 * ⚠ [Completed] means the PROVIDER accepted the payment, which is not the same as settled. The WEBHOOK
 * is authoritative for the order (019 R4); this result only drives the UI.
 *
 * ⚠ This used to live beside a `PaymentDriver` interface whose one method presented the provider's
 * modal payment sheet. That interface is gone (051): the sheet was replaced by an in-app element drawn
 * inside Effy's own payment screen, and nothing asks the platform to present anything any more. The
 * OUTCOME shape survived the driver because every payment still ends one of these three ways.
 */
sealed interface PaymentResult {
    /** The customer completed payment (subject to webhook confirmation). */
    data object Completed : PaymentResult

    /** The customer backed out without paying. Nothing was charged. */
    data object Canceled : PaymentResult

    /** Payment failed (declined / error); [message] is safe to show a shopper. */
    data class Failed(val message: String) : PaymentResult
}
