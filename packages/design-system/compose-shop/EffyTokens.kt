// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).
package com.effyshopping.shop.mobile.design

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** The raw Effy brand tokens, light and dark. Effy Emerald #065f46 is the primary accent. */
object EffyColor {
    object Light {
        val background = Color(0xFFEFEFF1)
        val foreground = Color(0xFF171717)
        val card = Color(0xFFFFFFFF)
        val cardForeground = Color(0xFF171717)
        val popover = Color(0xFFFFFFFF)
        val popoverForeground = Color(0xFF171717)
        val primary = Color(0xFF065F46)
        val primaryForeground = Color(0xFFFFFFFF)
        val secondary = Color(0xFFD4D4D4)
        val secondaryForeground = Color(0xFF171717)
        val muted = Color(0xFFD4D4D4)
        val mutedForeground = Color(0xFF525252)
        val accent = Color(0xFFD4D4D4)
        val accentForeground = Color(0xFF171717)
        val destructive = Color(0xFFBF5540)
        val destructiveForeground = Color(0xFFFFFFFF)
        val border = Color(0xFFD4D4D4)
        val input = Color(0xFFD4D4D4)
        val ring = Color(0xFF065F46)
    }

    object Dark {
        val background = Color(0xFF171717)
        val foreground = Color(0xFFFAFAFA)
        val card = Color(0xFF262626)
        val cardForeground = Color(0xFFFAFAFA)
        val popover = Color(0xFF262626)
        val popoverForeground = Color(0xFFFAFAFA)
        val primary = Color(0xFF065F46)
        val primaryForeground = Color(0xFFFFFFFF)
        val secondary = Color(0xFF262626)
        val secondaryForeground = Color(0xFFFAFAFA)
        val muted = Color(0xFF262626)
        val mutedForeground = Color(0xFFA3A3A3)
        val accent = Color(0xFF404040)
        val accentForeground = Color(0xFFFAFAFA)
        val destructive = Color(0xFFDD8368)
        val destructiveForeground = Color(0xFF0A0A0A)
        val border = Color(0xFF262626)
        val input = Color(0xFF404040)
        val ring = Color(0xFF10B981)
    }
}

/** Corner radii (dp) — sm/md pinned to equal the web --radius-sm/md; default = md. Pill via RoundedCornerShape(50%). */
object EffyRadius {
    val sm = 8.dp
    val md = 16.dp
    val default = 16.dp
}

/** The Effy spacing scale (dp), mirroring the design tokens (xs 4 · s 8 · md 12 · lg 16 · xl 20 · 4xl 40 → xxxl). */
object EffySpacing {
    val xs = 4.dp
    val s = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 20.dp
    val xxxl = 40.dp
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
