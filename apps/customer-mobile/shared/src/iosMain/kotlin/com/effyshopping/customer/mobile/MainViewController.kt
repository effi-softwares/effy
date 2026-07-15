package com.effyshopping.customer.mobile

import androidx.compose.ui.window.ComposeUIViewController
import com.effyshopping.customer.mobile.app.App
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.auth.IosAuthBridge
import com.effyshopping.customer.mobile.core.auth.IosAuthDriver

/**
 * The iOS entry point. Swift builds a [IosAuthBridge] (over Amplify Swift, which Kotlin/Native cannot
 * call — D5) and hands it in; this wraps it in the common [AuthDriver] contract. See `iosApp/`.
 */
fun MainViewController(authBridge: IosAuthBridge) =
    ComposeUIViewController { App(AppContainer(authDriver = IosAuthDriver(authBridge))) }
