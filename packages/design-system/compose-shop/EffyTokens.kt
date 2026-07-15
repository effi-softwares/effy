// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).
package com.effyshopping.shop.mobile.design

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** The raw Effy brand tokens, light and dark. Jade #0FB57E is the single accent. */
object EffyColor {
    object Light {
        val background = Color(0xFFFFFFFF)
        val foreground = Color(0xFF0A0A0A)
        val card = Color(0xFFFFFFFF)
        val cardForeground = Color(0xFF0A0A0A)
        val popover = Color(0xFFFFFFFF)
        val popoverForeground = Color(0xFF0A0A0A)
        val primary = Color(0xFF0FB57E)
        val primaryForeground = Color(0xFF052E1B)
        val secondary = Color(0xFFF5F5F5)
        val secondaryForeground = Color(0xFF171717)
        val muted = Color(0xFFF5F5F5)
        val mutedForeground = Color(0xFF737373)
        val accent = Color(0xFFF5F5F5)
        val accentForeground = Color(0xFF171717)
        val destructive = Color(0xFFDC2626)
        val destructiveForeground = Color(0xFFFFFFFF)
        val border = Color(0xFFE5E5E5)
        val input = Color(0xFFE5E5E5)
        val ring = Color(0xFF0FB57E)
    }

    object Dark {
        val background = Color(0xFF0A0A0A)
        val foreground = Color(0xFFFAFAFA)
        val card = Color(0xFF171717)
        val cardForeground = Color(0xFFFAFAFA)
        val popover = Color(0xFF171717)
        val popoverForeground = Color(0xFFFAFAFA)
        val primary = Color(0xFF0FB57E)
        val primaryForeground = Color(0xFF052E1B)
        val secondary = Color(0xFF262626)
        val secondaryForeground = Color(0xFFFAFAFA)
        val muted = Color(0xFF262626)
        val mutedForeground = Color(0xFFA1A1A1)
        val accent = Color(0xFF262626)
        val accentForeground = Color(0xFFFAFAFA)
        val destructive = Color(0xFFEF4444)
        val destructiveForeground = Color(0xFFFFFFFF)
        val border = Color(0xFF262626)
        val input = Color(0xFF262626)
        val ring = Color(0xFF0FB57E)
    }
}

object EffyRadius {
    val default = 10.dp
}

val EffyLightColorScheme: ColorScheme = lightColorScheme(
    primary = EffyColor.Light.primary,
    onPrimary = EffyColor.Light.primaryForeground,
    secondary = EffyColor.Light.secondary,
    onSecondary = EffyColor.Light.secondaryForeground,
    background = EffyColor.Light.background,
    onBackground = EffyColor.Light.foreground,
    surface = EffyColor.Light.card,
    onSurface = EffyColor.Light.cardForeground,
    surfaceVariant = EffyColor.Light.muted,
    onSurfaceVariant = EffyColor.Light.mutedForeground,
    error = EffyColor.Light.destructive,
    onError = EffyColor.Light.destructiveForeground,
    outline = EffyColor.Light.border,
)

val EffyDarkColorScheme: ColorScheme = darkColorScheme(
    primary = EffyColor.Dark.primary,
    onPrimary = EffyColor.Dark.primaryForeground,
    secondary = EffyColor.Dark.secondary,
    onSecondary = EffyColor.Dark.secondaryForeground,
    background = EffyColor.Dark.background,
    onBackground = EffyColor.Dark.foreground,
    surface = EffyColor.Dark.card,
    onSurface = EffyColor.Dark.cardForeground,
    surfaceVariant = EffyColor.Dark.muted,
    onSurfaceVariant = EffyColor.Dark.mutedForeground,
    error = EffyColor.Dark.destructive,
    onError = EffyColor.Dark.destructiveForeground,
    outline = EffyColor.Dark.border,
)
