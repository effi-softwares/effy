package com.effyshopping.customer.mobile.core.payment

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * The iOS side of the payment boundary (019 US3), mirroring [IosAuthDriver]. Kotlin/Native cannot call
 * the Stripe iOS SDK, so Swift implements the callback-based [IosPaymentBridge] (presenting
 * StripePaymentSheet from the top view controller), and THIS class adapts it to the common
 * [PaymentDriver] `suspend` contract. Swift builds [IosPaymentDriver] and hands it to `MainViewController`.
 */
class IosPaymentDriver(private val bridge: IosPaymentBridge) : PaymentDriver {
    override suspend fun presentPaymentSheet(clientSecret: String, publishableKey: String): PaymentResult =
        suspendCancellableCoroutine { cont ->
            bridge.presentPaymentSheet(clientSecret, publishableKey) { result ->
                val mapped = when (result.outcome) {
                    "completed" -> PaymentResult.Completed
                    "canceled" -> PaymentResult.Canceled
                    else -> PaymentResult.Failed(result.message ?: "Payment failed")
                }
                if (cont.isActive) cont.resume(mapped)
            }
        }
}

/** A flat payment result the Swift bridge returns. [outcome] is `completed` | `canceled` | `failed`. */
data class BridgePaymentResult(val outcome: String, val message: String? = null)

/**
 * The Swift-implemented payment bridge (019 US3). Plain callback — no `suspend` — so a Swift `NSObject`
 * can conform, present StripePaymentSheet with the `clientSecret`, and invoke the callback with the
 * result. The publishable key is a NAME, not a secret (R3).
 */
interface IosPaymentBridge {
    fun presentPaymentSheet(clientSecret: String, publishableKey: String, onResult: (BridgePaymentResult) -> Unit)
}
