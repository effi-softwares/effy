package com.effyshopping.shop.mobile.core.platform

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import platform.Foundation.NSNotificationCenter
import platform.UIKit.UIAccessibilityIsReduceMotionEnabled
import platform.UIKit.UIAccessibilityReduceMotionStatusDidChangeNotification
import platform.UIKit.UIUserInterfaceStyle
import platform.UIKit.UIViewController
import platform.darwin.NSObjectProtocol

class IosPlatformUiController : PlatformUiController {
    private val mutableState = MutableStateFlow(PlatformUiState(UIAccessibilityIsReduceMotionEnabled()))
    override val state: StateFlow<PlatformUiState> = mutableState.asStateFlow()
    private var viewController: UIViewController? = null
    private val observer: NSObjectProtocol = NSNotificationCenter.defaultCenter.addObserverForName(
        name = UIAccessibilityReduceMotionStatusDidChangeNotification,
        `object` = null,
        queue = null,
    ) { mutableState.value = PlatformUiState(UIAccessibilityIsReduceMotionEnabled()) }

    fun attach(viewController: UIViewController) {
        this.viewController = viewController
    }

    override fun applyAppearance(isDark: Boolean) {
        viewController?.overrideUserInterfaceStyle =
            if (isDark) {
                UIUserInterfaceStyle.UIUserInterfaceStyleDark
            } else {
                UIUserInterfaceStyle.UIUserInterfaceStyleLight
            }
        viewController?.setNeedsStatusBarAppearanceUpdate()
    }

    override fun dispose() {
        NSNotificationCenter.defaultCenter.removeObserver(observer)
        viewController = null
    }
}
