package com.effyshopping.shop.mobile.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.foundation.shape.RoundedCornerShape
import com.effyshopping.shop.mobile.design.EffyDarkColorScheme
import com.effyshopping.shop.mobile.design.EffyLightColorScheme
import com.effyshopping.shop.mobile.design.EffyRadius

/**
 * The app's theme (constitution Principle V; 013 FR-004/FR-005).
 *
 * Colours come ONLY from the GENERATED [EffyLightColorScheme] / [EffyDarkColorScheme] — derived from
 * `packages/design-system/src/tokens.css`, the brand's single source of truth, and diff-guarded so
 * they cannot drift (research D16). Never hardcode a colour here.
 *
 * Appearance (017 US2): the caller supplies an [AppearanceMode] (persisted per user). `System`
 * follows the device via [isSystemInDarkTheme]; `Light`/`Dark` force it. The default is `System`, so
 * `EffyTheme { … }` with no mode behaves exactly as before (device-driven).
 *
 * NOTE (Principle V deviation, recorded in plan Complexity Tracking): this is Material 3 on BOTH
 * platforms. iOS gets native behaviour (scroll, back-swipe, text, accessibility) but Material chrome,
 * not Apple HIG. The HIG-conformant SwiftUI shell is a later slice; because presentation is isolated
 * here, adopting it later touches only this layer.
 */
@Composable
fun EffyTheme(
    mode: AppearanceMode = AppearanceMode.System,
    onResolvedAppearance: (isDark: Boolean) -> Unit = {},
    content: @Composable () -> Unit,
) {
    val darkTheme = mode.resolveDark(isSystemInDarkTheme())
    SideEffect { onResolvedAppearance(darkTheme) }
    MaterialTheme(
        colorScheme = if (darkTheme) EffyDarkColorScheme else EffyLightColorScheme,
        typography = effyTypography(),
        shapes = Shapes(
            extraSmall = RoundedCornerShape(EffyRadius.sm),
            small = RoundedCornerShape(EffyRadius.sm),
            medium = RoundedCornerShape(EffyRadius.md),
            large = RoundedCornerShape(EffyRadius.md),
            extraLarge = RoundedCornerShape(EffyRadius.md),
        ),
        content = content,
    )
}
