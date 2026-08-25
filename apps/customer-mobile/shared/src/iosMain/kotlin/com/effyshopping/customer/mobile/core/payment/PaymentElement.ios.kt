package com.effyshopping.customer.mobile.core.payment

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.interop.UIKitView
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.UIKit.UIView
import kotlin.coroutines.resume

/**
 * The iOS in-app payment element (051 T050).
 *
 * ⚠ CORRECTION TO AN EARLIER NOTE IN THIS FILE. It previously shipped a placeholder that refused every
 * payment, on the stated grounds that the iOS SDK could not be verified from a command line. That was
 * wrong: `xcodebuild -resolvePackageDependencies` resolves SPM outside Xcode, and the pin resolves to
 * **Stripe iOS 24.25.0**, which has `EmbeddedPaymentElement.create(intentConfiguration:configuration:)`,
 * `confirm(completion:)`, `paymentOption`, and — decisively — `public var view: UIView`, which is
 * exactly what Compose Multiplatform's [UIKitView] interop consumes (research R17).
 *
 * ⚠ THE HEIGHT IS THE TRAP. The element GROWS when the shopper selects a method (a form expands beneath
 * the row), and a Compose interop view keeps whatever height it was measured at. Left alone, the card
 * fields render below the visible box and the shopper simply cannot reach them — with nothing on screen
 * suggesting anything is wrong. The bridge reports height on every change and the box follows it.
 */
private class IosPaymentElementHandle(
    private val bridge: IosPaymentElementBridge,
) : PaymentElementHandle {

    private val _state = MutableStateFlow(PaymentElementState())
    override val state: StateFlow<PaymentElementState> = _state.asStateFlow()

    /** The element's own view, handed to [UIKitView] once Swift has built it. */
    var view: UIView? = null
        private set

    /** Height in points, mirrored into Compose so the interop box can follow it. */
    var heightPoints: Double = 0.0
        private set

    fun start(config: PaymentElementConfig, onLayout: () -> Unit) {
        bridge.create(
            clientSecret = config.clientSecret,
            publishableKey = config.publishableKey,
            merchantName = config.merchantName,
            amountMinor = config.amountMinor,
            currency = config.currency,
            billing = config.billingDetails?.let {
                BridgeBillingDetails(
                    name = it.name,
                    email = it.email,
                    line1 = it.line1,
                    line2 = it.line2,
                    city = it.city,
                    state = it.state,
                    postalCode = it.postalCode,
                    country = it.country,
                )
            },
            onReady = { ready ->
                view = ready.view
                heightPoints = ready.heightPoints
                _state.value = _state.value.copy(
                    ready = ready.view != null && ready.error == null,
                    error = ready.error,
                )
                onLayout()
            },
            onChange = { change ->
                heightPoints = change.heightPoints
                _state.value = _state.value.copy(
                    selectedLabel = change.label,
                    mandateText = change.mandateText,
                )
                onLayout()
            },
        )
    }

    fun dispose() {
        bridge.dispose()
    }

    override suspend fun confirm(): PaymentResult = suspendCancellableCoroutine { cont ->
        bridge.confirm { result ->
            val mapped = when (result.outcome) {
                "completed" -> PaymentResult.Completed
                "canceled" -> PaymentResult.Canceled
                else -> PaymentResult.Failed(
                    result.message
                        ?: "We couldn't take that payment. Nothing has been charged.",
                )
            }
            if (cont.isActive) cont.resume(mapped)
        }
    }
}

/**
 * A handle that refuses honestly when Swift has not registered a factory.
 *
 * ⚠ This is the fallback, not the implementation. It exists so a build without the Swift bridge wired
 * still runs and SAYS SO, rather than presenting a dead screen or crashing.
 */
private class UnavailablePaymentElementHandle : PaymentElementHandle {
    override val state: StateFlow<PaymentElementState> = MutableStateFlow(
        PaymentElementState(
            ready = false,
            error = "Payments aren't available in this build. Please use the website to complete your order.",
        ),
    ).asStateFlow()

    override suspend fun confirm(): PaymentResult = PaymentResult.Failed(
        "Payments aren't available in this build.",
    )
}

@Composable
actual fun rememberPaymentElement(config: PaymentElementConfig): PaymentElementHandle? {
    val factory = IosPaymentElementRegistry.factory
        ?: return remember { UnavailablePaymentElementHandle() }

    // Recomposition trigger for the interop box: the bridge reports height off the Compose frame clock,
    // so a plain field write would not schedule one and the box would keep its first height.
    var layoutTick by remember { mutableStateOf(0) }

    val handle = remember(config.clientSecret) { IosPaymentElementHandle(factory()) }

    LaunchedEffect(handle) {
        handle.start(config) { layoutTick++ }
    }

    // ⚠ The element holds a live PaymentIntent and a view controller reference. Leaving the screen
    // without tearing it down leaks both, and the next payment would build a second element over the
    // first.
    DisposableEffect(handle) {
        onDispose { handle.dispose() }
    }

    // Read the tick so this composable re-runs when the bridge reports a new height.
    @Suppress("UNUSED_EXPRESSION")
    layoutTick

    return handle
}

@OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
@Composable
actual fun PaymentElementContent(handle: PaymentElementHandle, modifier: Modifier) {
    val ios = handle as? IosPaymentElementHandle ?: return
    val view = ios.view ?: return

    // ⚠ `.height(...)` from the bridge, NOT `wrapContentHeight()`. A UIKit view inside Compose does not
    // self-size: it is given a box and draws into it. Without an explicit, updating height the form
    // that expands under a selected method is clipped out of reach (research R17).
    UIKitView(
        factory = { view },
        modifier = modifier
            .fillMaxWidth()
            .height(ios.heightPoints.dp),
        update = { },
    )
}
