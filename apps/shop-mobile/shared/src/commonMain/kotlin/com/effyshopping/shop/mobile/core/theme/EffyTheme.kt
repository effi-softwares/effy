package com.effyshopping.shop.mobile.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import com.effyshopping.shop.mobile.design.EffyDarkColorScheme
import com.effyshopping.shop.mobile.design.EffyLightColorScheme

/**
 * The app's theme (constitution Principle V; 013 FR-004/FR-005).
 *
 * Colours come ONLY from the GENERATED [EffyLightColorScheme] / [EffyDarkColorScheme] — derived from
 * `packages/design-system/src/tokens.css`, the brand's single source of truth, and diff-guarded so
 * they cannot drift (research D16). Never hardcode a colour here. Dark mode follows the device.
 *
 * NOTE (Principle V deviation, recorded in plan Complexity Tracking): this is Material 3 on BOTH
 * platforms. iOS gets native behaviour (scroll, back-swipe, text, accessibility) but Material chrome,
 * not Apple HIG. The HIG-conformant SwiftUI shell is a later slice; because presentation is isolated
 * here, adopting it later touches only this layer.
 */
@Composable
fun EffyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) EffyDarkColorScheme else EffyLightColorScheme,
        content = content,
    )
}
