package com.effyshopping.customer.mobile.core.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.effyshopping.customer.mobile.design.EffyColor
import com.effyshopping.customer.mobile.design.EffyDarkColorScheme
import com.effyshopping.customer.mobile.design.EffyLightColorScheme
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.design.effyTypography

/** Is the app showing its dark appearance? Read by anything that must match it (status bar, payment). */
val LocalEffyDark = staticCompositionLocalOf { false }

/**
 * The app's theme: the storefront identity, light and dark. Colours, type and shapes come only from files
 * generated from `packages/design-system/src/tokens.css` (`:root` for light, `.dark` for dark),
 * guarded by `tokens:check`; never hardcode a colour. [dark] comes from the shopper's [AppearanceMode].
 *
 * Material 3's shape slots are overridden so no library radius leaks in: extraSmall 4 (checkboxes) ·
 * small 6 (buttons, fields, chips) · medium 8 (cards, image wells) · large 12 (banners) · extraLarge 16
 * (the top of a bottom sheet).
 */
@Composable
fun EffyTheme(dark: Boolean, content: @Composable () -> Unit) {
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
 * The storefront roles Material 3 has no slot for - read them here, never as literals. Each follows
 * the appearance.
 *
 * - [brand] Effy green: the wordmark's full stop, Sale, savings, "Delivered by Effy", paid, progress.
 *  never an action (buttons, links and selection are `colorScheme.primary`).
 * - [brandMuted] the green tint a brand word sits on; [brandFill] the green a white tick or label sits on
 *  ([brandForeground]), in both appearances.
 * - [primaryMuted] the blue tint: a selected tile, an info panel.
 * - [scrim] the backdrop behind a sheet.
 * - [promoGround] / [promoBlue] the grounds of promotional panels, which carry white type: they are the
 *  light palette's green and blue in both appearances (the dark palette's are pale, for text on dark
 *  white type would not read on them). "Promo grounds - banner artwork only, white type" (Foundations).
 */
object EffyRoles {
    val brand: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.brand, EffyColor.Dark.brand)
    val brandForeground: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.brandForeground, EffyColor.Dark.brandForeground)
    val brandMuted: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.brandMuted, EffyColor.Dark.brandMuted)
    val brandFill: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.brandFill, EffyColor.Dark.brandFill)
    val primaryMuted: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.primaryMuted, EffyColor.Dark.primaryMuted)
    val scrim: Color @Composable @ReadOnlyComposable get() = pick(EffyColor.Light.scrim, EffyColor.Dark.scrim)
    val promoGround: Color get() = EffyColor.Light.brand
    val promoBlue: Color get() = EffyColor.Light.primary

    /** The launch splash's ground (#09090B, packages/brand SPLASH_GROUND) and its ink - fixed. */
    val splashGround: Color get() = EffyColor.Light.foreground
    val splashInk: Color get() = EffyColor.Light.background

    @Composable
    @ReadOnlyComposable
    private fun pick(light: Color, dark: Color) = if (LocalEffyDark.current) dark else light
}
