// GENERATED FROM packages/design-system/src/tokens.css - DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
package com.effyshopping.customer.mobile.design

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/**
 * The storefront corner radii. sm checkboxes · md buttons, fields, chips · lg cards, image wells, sheets'
 * inner groups · xl banners · sheet the top corners of a bottom sheet. Pills are a shape (CircleShape),
 * used only for badges, dots, avatars and switches.
 */
object EffyStorefrontShape {
    val sm = 4.dp
    val md = 6.dp
    val lg = 8.dp
    val xl = 12.dp
    val sheet = 16.dp

    val small = RoundedCornerShape(sm)
    val control = RoundedCornerShape(md)
    val card = RoundedCornerShape(lg)
    val banner = RoundedCornerShape(xl)
    val sheetTop = RoundedCornerShape(topStart = sheet, topEnd = sheet)
}
