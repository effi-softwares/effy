package com.effyshopping.customer.mobile.core.payment

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * The iOS in-app payment element (051 T050).
 *
 * ⚠ THIS IS NOT YET WIRED TO SWIFT, AND THAT IS RECORDED RATHER THAN HIDDEN.
 *
 * Kotlin/Native cannot call the Stripe iOS SDK, so the real implementation is a Swift bridge in the
 * pattern [IosPaymentBridge] already establishes: Swift conforms to a callback interface, presents the
 * SDK, and hands results back. Writing that bridge requires resolving `StripePaymentSheet` in Xcode to
 * confirm the iOS SDK exposes the embedded element under the version this project pins
 * (`upToNextMajorVersion` from 24.0.0) — which cannot be done from a command line, so writing it now
 * would mean writing Swift against an API surface nobody has verified exists.
 *
 * What ships instead is a HANDLE THAT REFUSES HONESTLY: it reports not-ready with a message a shopper
 * can act on, so an iOS build compiles, runs, and says "payments are unavailable here" rather than
 * presenting a dead screen or crashing (FR-036).
 *
 * ⚠ THE CONSEQUENCE, STATED PLAINLY: **the mobile payment step does not work on iOS until the bridge
 * lands.** iOS shoppers must keep the existing [PaymentDriver] sheet — which is why that interface is
 * NOT deleted by this feature. Tracked as 051 T050; the parity register records it under FR-044.
 */
private class IosPaymentElementHandle : PaymentElementHandle {

    private val _state = MutableStateFlow(
        PaymentElementState(
            ready = false,
            error = "Payments aren't available in this version of the app yet. Please use the website to complete your order.",
        ),
    )
    override val state: StateFlow<PaymentElementState> = _state.asStateFlow()

    override suspend fun confirm(): PaymentResult = suspendCancellableCoroutine { cont ->
        // Unreachable through the UI — `canConfirm` is false while `ready` is false, so the pay button
        // is disabled. Answering rather than hanging is the point: a suspend call that never returns
        // would leave the screen busy forever if a future caller reached it.
        cont.resume(
            PaymentResult.Failed(
                "Payments aren't available in this version of the app yet.",
            ),
        )
    }
}

@Composable
actual fun rememberPaymentElement(config: PaymentElementConfig): PaymentElementHandle? {
    // `config` is deliberately unused until the Swift bridge lands; the parameter stays so the signature
    // matches and the day the bridge arrives, only this file changes.
    return remember { IosPaymentElementHandle() }
}

@Composable
actual fun PaymentElementContent(handle: PaymentElementHandle, modifier: Modifier) {
    // Nothing to render: the screen shows `state.error` above its own pay control, which is where a
    // shopper will actually look.
    Box(modifier)
}
