package com.effyshopping.shop.mobile

import androidx.compose.ui.window.ComposeUIViewController
import com.effyshopping.shop.mobile.app.App
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.auth.IosAuthBridge
import com.effyshopping.shop.mobile.core.auth.IosAuthDriver

/**
 * The iOS entry point. Swift builds a [IosAuthBridge] (over Amplify Swift, which Kotlin/Native cannot
 * call — 013 D5) and hands it in; this wraps it in the common [AuthDriver] contract. See `iosApp/`.
 */
fun MainViewController(authBridge: IosAuthBridge) =
    ComposeUIViewController { App(AppContainer(authDriver = IosAuthDriver(authBridge))) }
