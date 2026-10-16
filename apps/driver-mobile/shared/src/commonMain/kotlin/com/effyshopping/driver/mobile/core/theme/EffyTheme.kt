package com.effyshopping.driver.mobile.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.effyshopping.driver.mobile.design.EffyColor
import com.effyshopping.driver.mobile.design.EffyDarkColorScheme
import com.effyshopping.driver.mobile.design.EffyLightColorScheme
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.design.effyTypography

/** True while the driver app is drawn dark — what [EffyRoles] follows. */
val LocalEffyDark = staticCompositionLocalOf { false }

/**
 * The driver app's theme (092, constitution v3.5.0): the STOREFRONT identity, generated from
 * `packages/design-system/src/storefront/tokens.css` — Effy blue for the next action, Effy green for
 * done, a problem is black with an icon (no red, no orange), Geist, light and dark.
 */
@Composable
fun EffyTheme(
    mode: AppearanceMode = AppearanceMode.System,
    onResolvedAppearance: (isDark: Boolean) -> Unit = {},
    content: @Composable () -> Unit,
) {
    val dark = mode.resolveDark(isSystemInDarkTheme())
    SideEffect { onResolvedAppearance(dark) }
    CompositionLocalProvider(LocalEffyDark provides dark) {
        MaterialTheme(
            colorScheme = if (dark) EffyDarkColorScheme else EffyLightColorScheme,
            typography = effyTypography(),
            shapes = Shapes(
                extraSmall = EffyStorefrontShape.small,
                small = EffyStorefrontShape.control,
                medium = EffyStorefrontShape.card,
                large = EffyStorefrontShape.banner,
                extraLarge = EffyStorefrontShape.sheetTop,
            ),
            content = content,
        )
    }
}

/**
 * The roles Material 3 has no slot for — read them here, never as literals. Each follows the appearance.
 *
 * - [brand] Effy green: collected, delivered, on duty, done. ⚠ NEVER an action.
 * - [brandMuted] the green tint a done word sits on.
 * - [primaryMuted] the blue tint: the next stop's badge, info notes, the swipe track.
 * - [scrim] the backdrop behind a sheet.
 */
object EffyRoles {
    val brand: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.brand, EffyColor.Dark.brand)
    val brandForeground: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.brandForeground, EffyColor.Dark.brandForeground)
    val brandMuted: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.brandMuted, EffyColor.Dark.brandMuted)
    val primaryMuted: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.primaryMuted, EffyColor.Dark.primaryMuted)
    val scrim: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.scrim, EffyColor.Dark.scrim)

    /** 092 — the launch splash's fixed ground (#09090B, packages/brand SPLASH_GROUND) and its ink. No appearance. */
    val splashGround: Color get() = EffyColor.Light.foreground
    val splashInk: Color get() = EffyColor.Light.background

    @Composable
    @ReadOnlyComposable
    private fun pick(light: Color, dark: Color) = if (LocalEffyDark.current) dark else light
}
