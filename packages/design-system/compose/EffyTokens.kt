// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).
package com.effyshopping.customer.mobile.design

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/** The raw Effy brand tokens, light and dark. The accent is the neutral ramp and INVERTS by appearance. */
object EffyColor {
    object Light {
        val background = Color(0xFFFFFFFF)
        val foreground = Color(0xFF0B1220)
        val card = Color(0xFFFFFFFF)
        val cardForeground = Color(0xFF0B1220)
        val popover = Color(0xFFFFFFFF)
        val popoverForeground = Color(0xFF0B1220)
        val primary = Color(0xFF1D4ED8)
        val primaryForeground = Color(0xFFFFFFFF)
        val secondary = Color(0xFFF1F5FB)
        val secondaryForeground = Color(0xFF12224A)
        val muted = Color(0xFFF1F5FB)
        val mutedForeground = Color(0xFF5C6B86)
        val accent = Color(0xFFEDF2FD)
        val accentForeground = Color(0xFF12224A)
        val destructive = Color(0xFFCF2B1F)
        val destructiveForeground = Color(0xFFFFFFFF)
        val success = Color(0xFF0D8043)
        val disabled = Color(0xFFF1F5FB)
        val disabledForeground = Color(0xFF5C6B86)
        val placeholder = Color(0xFF5C6B86)
        val border = Color(0xFFE1E8F3)
        val input = Color(0xFFD7E0EE)
        val ring = Color(0xFF7993CA)
    }

    object Dark {
        val background = Color(0xFF0A0F1B)
        val foreground = Color(0xFFEEF2FA)
        val card = Color(0xFF0A0F1B)
        val cardForeground = Color(0xFFEEF2FA)
        val popover = Color(0xFF0A0F1B)
        val popoverForeground = Color(0xFFEEF2FA)
        val primary = Color(0xFF4D7CFF)
        val primaryForeground = Color(0xFF04102B)
        val secondary = Color(0xFF212B3F)
        val secondaryForeground = Color(0xFFEEF2FA)
        val muted = Color(0xFF141C2C)
        val mutedForeground = Color(0xFF97A4BC)
        val accent = Color(0xFF17203A)
        val accentForeground = Color(0xFFEEF2FA)
        val destructive = Color(0xFFFF7A6D)
        val destructiveForeground = Color(0xFF0A0F1B)
        val success = Color(0xFF44CF85)
        val disabled = Color(0xFF141C2C)
        val disabledForeground = Color(0xFF97A4BC)
        val placeholder = Color(0xFF97A4BC)
        val border = Color(0xFF212B3F)
        val input = Color(0xFF2A3550)
        val ring = Color(0xFF3D5FAE)
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
