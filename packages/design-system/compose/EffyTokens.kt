// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
package com.effyshopping.customer.mobile.design

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * The raw Effy storefront tokens, light and dark. Colour is rationed: black, white, zinc, Effy blue
 * (primary, every action) and Effy green (brand: Sale, savings, "Delivered by Effy", paid; never an
 * action). Rose for problems (destructive); a filled control (*Fill) carries white type in both appearances.
 */
object EffyColor {
    object Light {
        val background = Color(0xFFFFFFFF)
        val foreground = Color(0xFF09090B)
        val card = Color(0xFFFFFFFF)
        val cardForeground = Color(0xFF09090B)
        val popover = Color(0xFFFFFFFF)
        val popoverForeground = Color(0xFF09090B)
        val primary = Color(0xFF2563EB)
        val primaryForeground = Color(0xFFFFFFFF)
        val primaryFill = Color(0xFF2563EB)
        val secondary = Color(0xFFF4F4F5)
        val secondaryForeground = Color(0xFF18181B)
        val muted = Color(0xFFF4F4F5)
        val mutedForeground = Color(0xFF52525B)
        val accent = Color(0xFFF4F4F5)
        val accentForeground = Color(0xFF18181B)
        val destructive = Color(0xFFBE123C)
        val destructiveForeground = Color(0xFFFFFFFF)
        val destructiveFill = Color(0xFFF43F5E)
        val success = Color(0xFF047857)
        val disabled = Color(0xFFF4F4F5)
        val disabledForeground = Color(0xFF52525B)
        val placeholder = Color(0xFF52525B)
        val border = Color(0xFFE4E4E7)
        val input = Color(0xFFE4E4E7)
        val ring = Color(0xFF2563EB)
        val primaryMuted = Color(0xFFEFF6FF)
        val brand = Color(0xFF047857)
        val brandForeground = Color(0xFFFFFFFF)
        val brandFill = Color(0xFF059669)
        val brandMuted = Color(0xFFECFDF5)
        val scrim = Color(0x8009090B)
    }

    object Dark {
        val background = Color(0xFF09090B)
        val foreground = Color(0xFFFAFAFA)
        val card = Color(0xFF18181B)
        val cardForeground = Color(0xFFFAFAFA)
        val popover = Color(0xFF18181B)
        val popoverForeground = Color(0xFFFAFAFA)
        val primary = Color(0xFF60A5FA)
        val primaryForeground = Color(0xFFFFFFFF)
        val primaryFill = Color(0xFF2563EB)
        val secondary = Color(0xFF27272A)
        val secondaryForeground = Color(0xFFFAFAFA)
        val muted = Color(0xFF27272A)
        val mutedForeground = Color(0xFFA1A1AA)
        val accent = Color(0xFF27272A)
        val accentForeground = Color(0xFFFAFAFA)
        val destructive = Color(0xFFFB7185)
        val destructiveForeground = Color(0xFFFFFFFF)
        val destructiveFill = Color(0xFFF43F5E)
        val success = Color(0xFF10B981)
        val disabled = Color(0xFF27272A)
        val disabledForeground = Color(0xFFA1A1AA)
        val placeholder = Color(0xFFA1A1AA)
        val border = Color(0xFF27272A)
        val input = Color(0xFF3F3F46)
        val ring = Color(0xFF60A5FA)
        val primaryMuted = Color(0xFF172554)
        val brand = Color(0xFF10B981)
        val brandForeground = Color(0xFFFFFFFF)
        val brandFill = Color(0xFF059669)
        val brandMuted = Color(0xFF022C22)
        val scrim = Color(0x99000000)
    }
}

val EffyLightColorScheme: ColorScheme = lightColorScheme(
    primary = EffyColor.Light.primaryFill,
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
    surfaceTint = EffyColor.Light.primaryFill,
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
    primaryFixed = EffyColor.Light.primaryFill,
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
    primary = EffyColor.Dark.primaryFill,
    onPrimary = EffyColor.Dark.primaryForeground,
    primaryContainer = EffyColor.Dark.primaryMuted,
    onPrimaryContainer = EffyColor.Dark.primary,
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
    surfaceTint = EffyColor.Dark.primaryFill,
    inverseSurface = EffyColor.Dark.foreground,
    inverseOnSurface = EffyColor.Dark.background,
    error = EffyColor.Dark.destructive,
    onError = EffyColor.Dark.destructiveForeground,
    errorContainer = EffyColor.Dark.destructive,
    onErrorContainer = EffyColor.Dark.destructiveForeground,
    outline = EffyColor.Dark.border,
    outlineVariant = EffyColor.Dark.border,
    scrim = EffyColor.Dark.scrim,
    surfaceBright = EffyColor.Dark.card,
    surfaceDim = EffyColor.Dark.background,
    surfaceContainer = EffyColor.Dark.card,
    surfaceContainerHigh = EffyColor.Dark.popover,
    surfaceContainerHighest = EffyColor.Dark.popover,
    surfaceContainerLow = EffyColor.Dark.background,
    surfaceContainerLowest = EffyColor.Dark.background,
    primaryFixed = EffyColor.Dark.primaryFill,
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
