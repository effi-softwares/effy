package com.effyshopping.shop.mobile.core.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import com.effyshopping.shop.mobile.resources.Res
import com.effyshopping.shop.mobile.resources.nunito_sans_bold
import com.effyshopping.shop.mobile.resources.nunito_sans_regular
import com.effyshopping.shop.mobile.resources.nunito_sans_semibold
import org.jetbrains.compose.resources.Font

@Composable
internal fun effyTypography(): Typography {
    val family = FontFamily(
        Font(Res.font.nunito_sans_regular, FontWeight.Normal),
        Font(Res.font.nunito_sans_semibold, FontWeight.SemiBold),
        Font(Res.font.nunito_sans_bold, FontWeight.Bold),
    )
    return Typography(
        displayLarge = effyTextStyle(family, FontWeight.Bold, 48, 56),
        headlineLarge = effyTextStyle(family, FontWeight.Bold, 34, 40),
        headlineMedium = effyTextStyle(family, FontWeight.Bold, 30, 36),
        headlineSmall = effyTextStyle(family, FontWeight.Bold, 26, 32),
        titleLarge = effyTextStyle(family, FontWeight.Bold, 22, 28),
        titleMedium = effyTextStyle(family, FontWeight.SemiBold, 18, 24),
        titleSmall = effyTextStyle(family, FontWeight.SemiBold, 16, 22),
        bodyLarge = effyTextStyle(family, FontWeight.Normal, 17, 25),
        bodyMedium = effyTextStyle(family, FontWeight.Normal, 15, 22),
        bodySmall = effyTextStyle(family, FontWeight.Normal, 13, 18),
        labelLarge = effyTextStyle(family, FontWeight.SemiBold, 15, 20),
        labelMedium = effyTextStyle(family, FontWeight.SemiBold, 13, 18),
        labelSmall = effyTextStyle(family, FontWeight.SemiBold, 11, 16),
    )
}

private fun effyTextStyle(
    family: FontFamily,
    weight: FontWeight,
    size: Int,
    lineHeight: Int,
) = TextStyle(
    fontFamily = family,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
)
