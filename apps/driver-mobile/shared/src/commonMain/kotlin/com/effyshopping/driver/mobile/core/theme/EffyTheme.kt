package com.effyshopping.driver.mobile.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import com.effyshopping.driver.mobile.design.EffyDarkColorScheme
import com.effyshopping.driver.mobile.design.EffyLightColorScheme

/**
 * The app's theme (constitution Principle V; 017).
 *
 * Colours come ONLY from the GENERATED [EffyLightColorScheme] / [EffyDarkColorScheme] — derived from
 * `packages/design-system/src/tokens.css`, the brand's single source of truth, and diff-guarded so
 * they cannot drift from customer / shop / web (research D16). Never hardcode a colour here.
 *
 * Appearance (017 US2): the caller supplies an [AppearanceMode] (persisted per user). `System` follows
 * the device via [isSystemInDarkTheme]; `Light`/`Dark` force it. The default is `System`.
 *
 * NOTE (Principle V deviation, recorded in plan Complexity Tracking): Material 3 on BOTH platforms; the
 * HIG-conformant SwiftUI shell is a later slice. Because presentation is isolated here, adopting it
 * later touches only this layer.
 */
@Composable
fun EffyTheme(
    mode: AppearanceMode = AppearanceMode.System,
    content: @Composable () -> Unit,
) {
    val darkTheme = mode.resolveDark(isSystemInDarkTheme())
    MaterialTheme(
        colorScheme = if (darkTheme) EffyDarkColorScheme else EffyLightColorScheme,
        content = content,
    )
}
