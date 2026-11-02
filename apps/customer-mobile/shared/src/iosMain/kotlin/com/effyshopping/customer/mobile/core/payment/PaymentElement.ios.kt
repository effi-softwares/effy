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
 * The iOS in-app payment element: Stripe iOS's `EmbeddedPaymentElement`, whose `view: UIView` Compose's
 * [UIKitView] hosts. The element grows when a method is selected, and an interop view keeps its measured
 * height, so the card fields would render out of reach: the bridge reports every height change and the box
 * follows it.
 */
private class IosPaymentElementHandle(
    private val bridge: IosPaymentElementBridge,
) : PaymentElementHandle {

    private val _state = MutableStateFlow(PaymentElementState())
    override val state: StateFlow<PaymentElementState> = _state.asStateFlow()

    /**
     * The element's own view, handed to [UIKitView] once Swift has built it.
     *
     * ⚠ COMPOSE STATE, NOT A PLAIN FIELD. [PaymentElementContent] reads it, and under strong skipping
     * that composable is skipped whenever its arguments (this handle, an equal modifier) are unchanged -
     * which they always are. As a plain field it was read once, while Swift was still building the
     * element (null), and never again: the method list never appeared, nothing could be selected, and
     * the pay button stayed disabled. A snapshot read is what makes the composable re-run on its own.
     */
    var view: UIView? by mutableStateOf(null)
        private set

    /** Height in points - snapshot state for the same reason as [view], so the interop box follows it. */
    var heightPoints: Double by mutableStateOf(0.0)
        private set

    fun start(config: PaymentElementConfig) {
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
            },
            onChange = { change ->
                heightPoints = change.heightPoints
                _state.value = _state.value.copy(
                    selectedLabel = change.label,
                    mandateText = change.mandateText,
                )
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
 * This is the fallback, not the implementation. It exists so a build without the Swift bridge wired
 * still runs and says so, rather than presenting a dead screen or crashing.
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

    val handle = remember(config.clientSecret) { IosPaymentElementHandle(factory()) }

    LaunchedEffect(handle) {
        handle.start(config)
    }

    // The element holds a live PaymentIntent and a view controller reference. Leaving the screen
    // without tearing it down leaks both, and the next payment would build a second element over the
    // first.
    DisposableEffect(handle) {
        onDispose { handle.dispose() }
    }

    return handle
}

@OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
@Composable
actual fun PaymentElementContent(handle: PaymentElementHandle, modifier: Modifier) {
    val ios = handle as? IosPaymentElementHandle ?: return
    val view = ios.view ?: return

    // `.height(...)` from the bridge, not `wrapContentHeight`. A UIKit view inside Compose does not
    // self-size: it is given a box and draws into it. Without an explicit, updating height the form
    // that expands under a selected method is clipped out of reach.
    UIKitView(
        factory = { view },
        modifier = modifier
            .fillMaxWidth()
            .height(ios.heightPoints.dp),
        update = { },
    )
}
