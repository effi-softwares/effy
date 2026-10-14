package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import platform.UIKit.UIApplication
import platform.UIKit.UIUserInterfaceStyle
import platform.UIKit.UIWindow

/**
 * iOS draws the status bar to match the interface style, so the key window's style is set to the app's
 * appearance (dark → light status-bar text). That also makes keyboards and the payment sheet match the
 * app. The app's own colours never read it — they come from EffyTheme.
 */
@Composable
actual fun StatusBarIcons(lightIcons: Boolean) {
    DisposableEffect(lightIcons) {
        val window = keyWindow()
        window?.overrideUserInterfaceStyle =
            if (lightIcons) UIUserInterfaceStyle.UIUserInterfaceStyleDark else UIUserInterfaceStyle.UIUserInterfaceStyleLight
        // No reset on dispose: whoever composes next (the app after the intro) sets its own.
        onDispose { }
    }
}

@Suppress("DEPRECATION")
private fun keyWindow(): UIWindow? =
    UIApplication.sharedApplication.keyWindow
        ?: UIApplication.sharedApplication.windows.firstOrNull() as? UIWindow
