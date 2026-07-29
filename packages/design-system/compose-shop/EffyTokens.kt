// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).
package com.effyshopping.shop.mobile.design

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/** The raw Effy brand tokens, light and dark. The accent is the neutral ramp and INVERTS by appearance. */
object EffyColor {
    object Light {
        val background = Color(0xFFFFFFFF)
        val foreground = Color(0xFF1A1A1A)
        val card = Color(0xFFFFFFFF)
        val cardForeground = Color(0xFF1A1A1A)
        val popover = Color(0xFFFFFFFF)
        val popoverForeground = Color(0xFF1A1A1A)
        val primary = Color(0xFF1A1A1A)
        val primaryForeground = Color(0xFFFFFFFF)
        val secondary = Color(0xFFE6E6E6)
        val secondaryForeground = Color(0xFF1A1A1A)
        val muted = Color(0xFFE6E6E6)
        val mutedForeground = Color(0xFF666666)
        val accent = Color(0xFFF5F5F5)
        val accentForeground = Color(0xFF1A1A1A)
        val destructive = Color(0xFFE01010)
        val destructiveForeground = Color(0xFFFFFFFF)
        val success = Color(0xFF0C9409)
        val disabled = Color(0xFFE6E6E6)
        val disabledForeground = Color(0xFF808080)
        val placeholder = Color(0xFF808080)
        val border = Color(0xFFE6E6E6)
        val input = Color(0xFFE6E6E6)
        val ring = Color(0xFF1A1A1A)
    }

    object Dark {
        val background = Color(0xFF1A1A1A)
        val foreground = Color(0xFFFFFFFF)
        val card = Color(0xFF333333)
        val cardForeground = Color(0xFFFFFFFF)
        val popover = Color(0xFF333333)
        val popoverForeground = Color(0xFFFFFFFF)
        val primary = Color(0xFFF5F5F5)
        val primaryForeground = Color(0xFF1A1A1A)
        val secondary = Color(0xFF333333)
        val secondaryForeground = Color(0xFFFFFFFF)
        val muted = Color(0xFF333333)
        val mutedForeground = Color(0xFFB3B3B3)
        val accent = Color(0xFF4D4D4D)
        val accentForeground = Color(0xFFFFFFFF)
        val destructive = Color(0xFFFF6B6B)
        val destructiveForeground = Color(0xFF0A0A0A)
        val success = Color(0xFF22C55E)
        val disabled = Color(0xFF333333)
        val disabledForeground = Color(0xFF808080)
        val placeholder = Color(0xFF808080)
        val border = Color(0xFF4D4D4D)
        val input = Color(0xFF4D4D4D)
        val ring = Color(0xFFFFFFFF)
    }
}

val EffyLightColorScheme: ColorScheme = lightColorScheme(
    primary = EffyColor.Light.primary,
    onPrimary = EffyColor.Light.primaryForeground,
    primaryContainer = EffyColor.Light.accent,
    onPrimaryContainer = EffyColor.Light.accentForeground,
    inversePrimary = EffyColor.Light.primary,
    secondary = EffyColor.Light.secondary,
    onSecondary = EffyColor.Light.secondaryForeground,
    secondaryContainer = EffyColor.Light.secondary,
    onSecondaryContainer = EffyColor.Light.secondaryForeground,
    tertiary = EffyColor.Light.accent,
    onTertiary = EffyColor.Light.accentForeground,
    tertiaryContainer = EffyColor.Light.accent,
    onTertiaryContainer = EffyColor.Light.accentForeground,
    background = EffyColor.Light.background,
    onBackground = EffyColor.Light.foreground,
    surface = EffyColor.Light.card,
    onSurface = EffyColor.Light.cardForeground,
    surfaceVariant = EffyColor.Light.muted,
    onSurfaceVariant = EffyColor.Light.mutedForeground,
    surfaceTint = EffyColor.Light.primary,
    inverseSurface = EffyColor.Light.foreground,
    inverseOnSurface = EffyColor.Light.background,
    error = EffyColor.Light.destructive,
    onError = EffyColor.Light.destructiveForeground,
    errorContainer = EffyColor.Light.destructive,
    onErrorContainer = EffyColor.Light.destructiveForeground,
    outline = EffyColor.Light.border,
    outlineVariant = EffyColor.Light.border,
    scrim = EffyColor.Light.foreground,
    surfaceBright = EffyColor.Light.card,
    surfaceDim = EffyColor.Light.background,
    surfaceContainer = EffyColor.Light.card,
    surfaceContainerHigh = EffyColor.Light.popover,
    surfaceContainerHighest = EffyColor.Light.popover,
    surfaceContainerLow = EffyColor.Light.background,
    surfaceContainerLowest = EffyColor.Light.background,
    primaryFixed = EffyColor.Light.primary,
    primaryFixedDim = EffyColor.Light.ring,
    onPrimaryFixed = EffyColor.Light.primaryForeground,
    onPrimaryFixedVariant = EffyColor.Light.primaryForeground,
    secondaryFixed = EffyColor.Light.secondary,
    secondaryFixedDim = EffyColor.Light.muted,
    onSecondaryFixed = EffyColor.Light.secondaryForeground,
    onSecondaryFixedVariant = EffyColor.Light.secondaryForeground,
    tertiaryFixed = EffyColor.Light.accent,
    tertiaryFixedDim = EffyColor.Light.muted,
    onTertiaryFixed = EffyColor.Light.accentForeground,
    onTertiaryFixedVariant = EffyColor.Light.accentForeground,
)

val EffyDarkColorScheme: ColorScheme = darkColorScheme(
    primary = EffyColor.Dark.primary,
    onPrimary = EffyColor.Dark.primaryForeground,
    primaryContainer = EffyColor.Dark.accent,
    onPrimaryContainer = EffyColor.Dark.accentForeground,
    inversePrimary = EffyColor.Dark.primary,
    secondary = EffyColor.Dark.secondary,
    onSecondary = EffyColor.Dark.secondaryForeground,
    secondaryContainer = EffyColor.Dark.secondary,
    onSecondaryContainer = EffyColor.Dark.secondaryForeground,
    tertiary = EffyColor.Dark.accent,
    onTertiary = EffyColor.Dark.accentForeground,
    tertiaryContainer = EffyColor.Dark.accent,
    onTertiaryContainer = EffyColor.Dark.accentForeground,
    background = EffyColor.Dark.background,
    onBackground = EffyColor.Dark.foreground,
    surface = EffyColor.Dark.card,
    onSurface = EffyColor.Dark.cardForeground,
    surfaceVariant = EffyColor.Dark.muted,
    onSurfaceVariant = EffyColor.Dark.mutedForeground,
    surfaceTint = EffyColor.Dark.primary,
    inverseSurface = EffyColor.Dark.foreground,
    inverseOnSurface = EffyColor.Dark.background,
    error = EffyColor.Dark.destructive,
    onError = EffyColor.Dark.destructiveForeground,
    errorContainer = EffyColor.Dark.destructive,
    onErrorContainer = EffyColor.Dark.destructiveForeground,
    outline = EffyColor.Dark.border,
    outlineVariant = EffyColor.Dark.border,
    scrim = EffyColor.Dark.foreground,
    surfaceBright = EffyColor.Dark.card,
    surfaceDim = EffyColor.Dark.background,
    surfaceContainer = EffyColor.Dark.card,
    surfaceContainerHigh = EffyColor.Dark.popover,
    surfaceContainerHighest = EffyColor.Dark.popover,
    surfaceContainerLow = EffyColor.Dark.background,
    surfaceContainerLowest = EffyColor.Dark.background,
    primaryFixed = EffyColor.Dark.primary,
    primaryFixedDim = EffyColor.Dark.ring,
    onPrimaryFixed = EffyColor.Dark.primaryForeground,
    onPrimaryFixedVariant = EffyColor.Dark.primaryForeground,
    secondaryFixed = EffyColor.Dark.secondary,
    secondaryFixedDim = EffyColor.Dark.muted,
    onSecondaryFixed = EffyColor.Dark.secondaryForeground,
    onSecondaryFixedVariant = EffyColor.Dark.secondaryForeground,
    tertiaryFixed = EffyColor.Dark.accent,
    tertiaryFixedDim = EffyColor.Dark.muted,
    onTertiaryFixed = EffyColor.Dark.accentForeground,
    onTertiaryFixedVariant = EffyColor.Dark.accentForeground,
)
