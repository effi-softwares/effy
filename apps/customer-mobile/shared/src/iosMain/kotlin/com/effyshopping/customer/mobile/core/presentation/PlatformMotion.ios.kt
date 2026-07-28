package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import com.effyshopping.mobile.kit.ui.MotionLevel
import platform.UIKit.UIAccessibilityIsReduceMotionEnabled

/**
 * iOS reads `UIAccessibilityIsReduceMotionEnabled()` — Settings → Accessibility → Motion → Reduce
 * Motion.
 *
 * ⚠ Maps to [MotionLevel.Reduced], NOT [MotionLevel.None]. Apple's own guidance for this setting is
 * to replace movement with a cross-fade rather than to remove the transition — a screen that simply
 * snaps into place reads as a glitch. `Reduced` keeps the short fade for visibility and root-state
 * changes and drops translation and scale everywhere else, which is that guidance expressed once.
 */
@Composable
actual fun platformMotionLevel(): MotionLevel = remember {
    if (UIAccessibilityIsReduceMotionEnabled()) MotionLevel.Reduced else MotionLevel.Full
}
