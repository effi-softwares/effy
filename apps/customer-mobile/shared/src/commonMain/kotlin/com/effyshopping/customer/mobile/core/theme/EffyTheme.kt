package com.effyshopping.customer.mobile.core.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import com.effyshopping.customer.mobile.design.EffyColor
import com.effyshopping.customer.mobile.design.EffyLightColorScheme
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.design.effyTypography

/**
 * The app's theme — the STOREFRONT identity (constitution v3.3.0, Principle V; 087).
 *
 * Colours, type and shapes come ONLY from files GENERATED from
 * `packages/design-system/src/storefront/tokens.css` (the same file the customer website wears) and
 * diff-guarded by `tokens:check`. Never hardcode a colour here or in a screen.
 *
 * ⚠ LIGHT ONLY. The storefront identity has no dark appearance, so there is no mode parameter and the
 * device's dark setting is deliberately ignored (087 FR-004). The Light / Dark / System preference
 * (017) was removed with it; it never had a settings screen.
 *
 * Material 3's shape slots are overridden so no library default radius leaks in:
 * extraSmall 4 (checkboxes) · small 6 (buttons, fields, chips) · medium 8 (cards, image wells) ·
 * large 12 (banners) · extraLarge 16 (the top of a bottom sheet).
 */
@Composable
fun EffyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = EffyLightColorScheme,
        typography = effyTypography(),
        shapes = Shapes(
            extraSmall = EffyStorefrontShape.small,
            small = EffyStorefrontShape.control,
            medium = EffyStorefrontShape.card,
            large = EffyStorefrontShape.banner,
            extraLarge = EffyStorefrontShape.sheetTop,
        ),
        content = content,
    )
}

/**
 * The storefront roles Material 3 has no slot for — read them here, never as literals.
 *
 * - [brand] Effy green: the wordmark's full stop, Sale, savings, "Delivered by Effy", paid, progress.
 *   ⚠ NEVER an action (buttons, links and selection are `colorScheme.primary`).
 * - [brandMuted] the green tint a brand word sits on.
 * - [primaryMuted] the light-blue tint: the search field, a selected tile, an info panel.
 * - [scrim] the backdrop behind a sheet.
 */
object EffyRoles {
    val brand get() = EffyColor.Light.brand
    val brandForeground get() = EffyColor.Light.brandForeground
    val brandMuted get() = EffyColor.Light.brandMuted
    val primaryMuted get() = EffyColor.Light.primaryMuted
    val scrim get() = EffyColor.Light.scrim
}
