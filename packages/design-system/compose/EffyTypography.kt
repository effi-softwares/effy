// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).
package com.effyshopping.customer.mobile.design

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.jetbrains.compose.resources.Font
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.general_sans_medium
import com.effyshopping.customer.mobile.resources.general_sans_regular
import com.effyshopping.customer.mobile.resources.general_sans_semibold

/**
 * General Sans, the platform typeface (constitution Principle V, v1.11.0).
 *
 * ⚠ There is NO Bold 700. The design language tops out at SemiBold 600, so the scale below is
 * SemiBold-led — Medium 500 replaces the weight slot Nunito Sans filled with Bold. Requesting
 * FontWeight.Bold resolves to the nearest available face rather than a real bold.
 */
@Composable
fun effyFontFamily(): FontFamily = FontFamily(
    Font(Res.font.general_sans_regular, FontWeight.Normal),
    Font(Res.font.general_sans_medium, FontWeight.Medium),
    Font(Res.font.general_sans_semibold, FontWeight.SemiBold),
)

/**
 * The Effy Material 3 type scale. Identical across every mobile surface by construction.
 *
 * Sizes come from the source design language's 14 styles (026 data-model §3): H1 64 / H2 32 / H3 24 /
 * H4 20, and B1 16 / B2 14 / B3 12 in Regular, Medium and SemiBold. Material 3 has more slots than the
 * design has steps, so some slots deliberately share a step.
 *
 * ⚠ TRACKING. H1 and H2 carry the design's signature -5% letter-spacing; everything else is 0.
 * ⚠ H1's line height is 0.8 x its size (64 -> 51sp), which sits BELOW the cap height. That is
 *   intentional for one- or two-word display strings and WILL clip descenders on longer text — use
 *   displayLarge only where the source does (the onboarding screen).
 */
@Composable
fun effyTypography(): Typography {
    val family = effyFontFamily()
    return Typography(
        displayLarge = effyTextStyle(family, FontWeight.SemiBold, 64, 51, -0.05f),
        headlineLarge = effyTextStyle(family, FontWeight.SemiBold, 32, 32, -0.05f),
        headlineMedium = effyTextStyle(family, FontWeight.SemiBold, 24, 29),
        headlineSmall = effyTextStyle(family, FontWeight.SemiBold, 20, 24),
        titleLarge = effyTextStyle(family, FontWeight.SemiBold, 20, 24),
        titleMedium = effyTextStyle(family, FontWeight.Medium, 20, 24),
        titleSmall = effyTextStyle(family, FontWeight.SemiBold, 16, 22),
        bodyLarge = effyTextStyle(family, FontWeight.Normal, 16, 22),
        bodyMedium = effyTextStyle(family, FontWeight.Normal, 14, 20),
        bodySmall = effyTextStyle(family, FontWeight.Normal, 12, 17),
        labelLarge = effyTextStyle(family, FontWeight.Medium, 16, 22),
        labelMedium = effyTextStyle(family, FontWeight.Medium, 14, 20),
        labelSmall = effyTextStyle(family, FontWeight.Medium, 12, 17),
    )
}

private fun effyTextStyle(
    family: FontFamily,
    weight: FontWeight,
    size: Int,
    lineHeight: Int,
    /** Tracking as a FRACTION OF THE FONT SIZE (em), matching the source design's percentage units. */
    letterSpacingEm: Float = 0f,
) = TextStyle(
    fontFamily = family,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = (size * letterSpacingEm).sp,
)
