// GENERATED FROM packages/design-system/src/customer-web/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
package com.effyshopping.driver.mobile.design

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.jetbrains.compose.resources.Font
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.geist_bold
import com.effyshopping.driver.mobile.resources.geist_medium
import com.effyshopping.driver.mobile.resources.geist_mono_medium
import com.effyshopping.driver.mobile.resources.geist_regular
import com.effyshopping.driver.mobile.resources.geist_semibold

/** Geist, bundled; no run-time download. */
@Composable
fun effyFontFamily(): FontFamily = FontFamily(
    Font(Res.font.geist_regular, FontWeight.Normal),
    Font(Res.font.geist_medium, FontWeight.Medium),
    Font(Res.font.geist_semibold, FontWeight.SemiBold),
    Font(Res.font.geist_bold, FontWeight.Bold),
)

/** Geist Mono — one-time codes and order numbers, read out digit by digit. */
@Composable
fun effyMonoFontFamily(): FontFamily = FontFamily(Font(Res.font.geist_mono_medium, FontWeight.Medium))

/** The Material 3 type scale: all fifteen slots defined, so none falls back to the platform font. */
@Composable
fun effyTypography(): Typography {
    val family = effyFontFamily()
    return Typography(
        displayLarge = effyTextStyle(family, FontWeight.Bold, 36, 40, -0.025f),
        displayMedium = effyTextStyle(family, FontWeight.Bold, 34, 41, -0.025f),
        displaySmall = effyTextStyle(family, FontWeight.Bold, 30, 36, -0.02f),
        headlineLarge = effyTextStyle(family, FontWeight.SemiBold, 32, 36, -0.025f),
        headlineMedium = effyTextStyle(family, FontWeight.SemiBold, 24, 32, -0.025f),
        headlineSmall = effyTextStyle(family, FontWeight.SemiBold, 20, 28, -0.01f),
        titleLarge = effyTextStyle(family, FontWeight.SemiBold, 20, 28, -0.01f),
        titleMedium = effyTextStyle(family, FontWeight.SemiBold, 17, 24, -0.01f),
        titleSmall = effyTextStyle(family, FontWeight.SemiBold, 16, 22),
        bodyLarge = effyTextStyle(family, FontWeight.Normal, 16, 22),
        bodyMedium = effyTextStyle(family, FontWeight.Normal, 14, 20),
        bodySmall = effyTextStyle(family, FontWeight.Normal, 12, 16),
        labelLarge = effyTextStyle(family, FontWeight.Medium, 16, 22),
        labelMedium = effyTextStyle(family, FontWeight.Medium, 14, 20),
        labelSmall = effyTextStyle(family, FontWeight.Medium, 12, 16),
    )
}

private fun effyTextStyle(
    family: FontFamily,
    weight: FontWeight,
    size: Int,
    lineHeight: Int,
    /** Tracking as a fraction of the font size (em). */
    letterSpacingEm: Float = 0f,
) = TextStyle(
    fontFamily = family,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = (size * letterSpacingEm).sp,
)
