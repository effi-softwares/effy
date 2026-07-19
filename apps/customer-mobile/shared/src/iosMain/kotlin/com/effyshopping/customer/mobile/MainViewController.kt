package com.effyshopping.customer.mobile

import androidx.compose.ui.window.ComposeUIViewController
import com.effyshopping.customer.mobile.app.App
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.auth.IosAuthBridge
import com.effyshopping.customer.mobile.core.auth.IosAuthDriver
import com.effyshopping.customer.mobile.core.payment.IosPaymentBridge
import com.effyshopping.customer.mobile.core.payment.IosPaymentDriver

/**
 * The iOS entry point. Swift builds a [IosAuthBridge] (over Amplify Swift) and a [IosPaymentBridge]
 * (over StripePaymentSheet) — neither callable from Kotlin/Native (D5) — and hands them in; this wraps
 * each in its common driver contract. See `iosApp/`.
 */
fun MainViewController(authBridge: IosAuthBridge, paymentBridge: IosPaymentBridge) =
    ComposeUIViewController {
        App(
            AppContainer(
                authDriver = IosAuthDriver(authBridge),
                paymentDriver = IosPaymentDriver(paymentBridge),
            ),
        )
    }
