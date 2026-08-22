package com.effyshopping.driver.mobile

import androidx.compose.ui.window.ComposeUIViewController
import com.effyshopping.driver.mobile.app.App
import com.effyshopping.driver.mobile.app.AppContainer
import com.effyshopping.driver.mobile.core.auth.IosAuthBridge
import com.effyshopping.driver.mobile.core.auth.IosAuthDriver
import com.effyshopping.driver.mobile.core.platform.IosPlatformUiController
import platform.UIKit.UIViewController

/**
 * The iOS entry point (049). Swift builds an [IosAuthBridge] (over Amplify Swift, which Kotlin/Native
 * cannot call — D5) and hands it in; this wraps it in the common `AuthDriver` contract. See `iosApp/`.
 */
fun MainViewController(authBridge: IosAuthBridge): UIViewController {
    val platformUiController = IosPlatformUiController()
    val container = AppContainer(authDriver = IosAuthDriver(authBridge))
    val viewController = ComposeUIViewController {
        App(container, platformUiController)
    }
    platformUiController.attach(viewController)
    return viewController
}
