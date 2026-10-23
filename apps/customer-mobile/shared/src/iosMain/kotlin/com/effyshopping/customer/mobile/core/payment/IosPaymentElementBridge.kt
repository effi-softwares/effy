package com.effyshopping.customer.mobile.core.payment

import platform.UIKit.UIView

/**
 * The Swift-implemented in-app payment element bridge.
 *
 * Plain callbacks, no `suspend`, and no Kotlin coroutine types in the signatures — a Swift `NSObject`
 * has to be able to conform to this, exactly as [IosPaymentBridge] and `IosAuthBridge` already do. The
 * `suspend` shape is reconstructed on the Kotlin side.
 *
 * The provider's SDK is swift-only. Kotlin/Native cannot call `EmbeddedPaymentElement` directly, so
 * swift owns the element and hands back the two things Compose needs: a [UIView] to embed, and a stream
 * of state changes.
 */
interface IosPaymentElementBridge {

    /**
     * Build the element and load the shopper's payment options.
     *
     * [onReady] fires once with the element's view when it is usable, or with a null view and a message
     * when it is not. A shopper who cannot pay must be told; an inert screen with no message is
     * indistinguishable from a broken app.
     */
    fun create(
        clientSecret: String,
        publishableKey: String,
        merchantName: String,
        amountMinor: Long,
        currency: String,
        billing: BridgeBillingDetails?,
        onReady: (BridgeElementReady) -> Unit,
        onChange: (BridgeElementSelection) -> Unit,
    )

    /** Confirm with whatever the shopper selected. Calls back exactly once. */
    fun confirm(onResult: (BridgePaymentResult) -> Unit)

    /** Tear the element down when the screen leaves. */
    fun dispose()
}

/**
 * The element's view, once loaded.
 *
 * [heightPoints] is not cosmetic. The element's height changes as the shopper selects a method (a
 * form expands beneath the row), and a Compose interop view has a fixed measured height unless it is
 * told otherwise — so without this the list is clipped and the shopper cannot reach the fields. It
 * arrives again on every [BridgeElementSelection].
 */
data class BridgeElementReady(
    val view: UIView?,
    val heightPoints: Double,
    val error: String?,
)

/** A change in what the shopper has selected, or in how tall the element needs to be. */
data class BridgeElementSelection(
    val label: String?,
    val mandateText: String?,
    val heightPoints: Double,
)

/**
 * A flat payment result from the Swift bridge; [outcome] is `completed` | `canceled` | `failed`. Kotlin/Native
 * cannot receive a sealed [PaymentResult] from Swift, so the bridge speaks strings.
 */
data class BridgePaymentResult(val outcome: String, val message: String? = null)

/** Billing details Effy supplies on the shopper's behalf — the element collects none of this. */
data class BridgeBillingDetails(
    val name: String?,
    val email: String?,
    val line1: String,
    val line2: String?,
    val city: String,
    val state: String,
    val postalCode: String,
    val country: String,
)

/**
 * Set once by Swift at startup, the way the auth bridge is handed to `MainViewController`.
 *
 * A factory rather than a single instance: each payment screen needs its own element (a new
 * PaymentIntent means a new element), and sharing one across screens would confirm the wrong intent.
 */
object IosPaymentElementRegistry {
    var factory: (() -> IosPaymentElementBridge)? = null
}
