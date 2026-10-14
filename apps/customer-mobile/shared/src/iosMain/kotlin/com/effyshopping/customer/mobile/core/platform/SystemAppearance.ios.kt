package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import platform.UIKit.UIScreen
import platform.UIKit.UIUserInterfaceStyle

/** The screen's style — the phone's setting, untouched by the app's own window override. */
@Composable
actual fun phoneInDarkMode(): Boolean {
    var dark by remember { mutableStateOf(readScreen()) }
    // The setting can change while the app is in the background (Control Centre, a schedule): re-read
    // whenever the app comes back to the foreground.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { dark = readScreen() }
    return dark
}

private fun readScreen(): Boolean =
    UIScreen.mainScreen.traitCollection.userInterfaceStyle == UIUserInterfaceStyle.UIUserInterfaceStyleDark
