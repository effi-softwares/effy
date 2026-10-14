// GENERATED FROM packages/design-system/src/storefront/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).
package com.effyshopping.customer.mobile.design

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * The raw Effy STOREFRONT tokens (087). LIGHT ONLY — the storefront identity has no dark appearance.
 * Colour is rationed: black, white, zinc, Effy blue (primary — every action) and Effy green (brand —
 * Sale, savings, "Delivered by Effy", paid; never an action). No red: destructive is black.
 */
object EffyColor {
    object Light {
        val background = Color(0xFFFFFFFF)
        val foreground = Color(0xFF09090B)
        val card = Color(0xFFFFFFFF)
        val cardForeground = Color(0xFF09090B)
        val popover = Color(0xFFFFFFFF)
        val popoverForeground = Color(0xFF09090B)
        val primary = Color(0xFF1D4ED8)
        val primaryForeground = Color(0xFFFFFFFF)
        val secondary = Color(0xFFF4F4F5)
        val secondaryForeground = Color(0xFF18181B)
        val muted = Color(0xFFF4F4F5)
        val mutedForeground = Color(0xFF68686F)
        val accent = Color(0xFFF4F4F5)
        val accentForeground = Color(0xFF18181B)
        val destructive = Color(0xFF09090B)
        val destructiveForeground = Color(0xFFFFFFFF)
        val success = Color(0xFF0D7A40)
        val disabled = Color(0xFFF4F4F5)
        val disabledForeground = Color(0xFF68686F)
        val placeholder = Color(0xFF68686F)
        val border = Color(0xFFE4E4E7)
        val input = Color(0xFFE4E4E7)
        val ring = Color(0xFF1D4ED8)
        val primaryMuted = Color(0xFFEFF4FF)
        val brand = Color(0xFF0D7A40)
        val brandForeground = Color(0xFFFFFFFF)
        val brandMuted = Color(0xFFEBF6EF)
        val scrim = Color(0x8009090B)
    }
}

val EffyLightColorScheme: ColorScheme = lightColorScheme(
    primary = EffyColor.Light.primary,
    onPrimary = EffyColor.Light.primaryForeground,
    primaryContainer = EffyColor.Light.primaryMuted,
    onPrimaryContainer = EffyColor.Light.primary,
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
    scrim = EffyColor.Light.scrim,
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
