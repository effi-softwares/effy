package com.effyshopping.customer.mobile.core.payment

/**
 * The payment capability (019 US3) — the ARCHITECTURE.md "payments" native driver. ONE interface in
 * commonMain; two implementations, mirroring [AuthDriver] (013 D5): `AndroidPaymentDriver` on Android
 * (Stripe Android PaymentSheet) and `IosPaymentDriver` on iOS (a Swift bridge over StripePaymentSheet).
 *
 * The server (core-api) already created the PaymentIntent and owns the secret; the client only PRESENTS
 * the sheet with the `clientSecret` (+ the publishable key, a name not a secret — R3) and reports the
 * outcome. The webhook is authoritative for the order (R4); this result only drives the UI.
 */
interface PaymentDriver {
    suspend fun presentPaymentSheet(clientSecret: String, publishableKey: String): PaymentResult
}

/** The flat outcome of presenting the payment sheet. */
sealed interface PaymentResult {
    /** The customer completed payment (subject to webhook confirmation). */
    data object Completed : PaymentResult

    /** The customer dismissed the sheet without paying. */
    data object Canceled : PaymentResult

    /** Payment failed (declined / error); [message] is safe to show. */
    data class Failed(val message: String) : PaymentResult
}
