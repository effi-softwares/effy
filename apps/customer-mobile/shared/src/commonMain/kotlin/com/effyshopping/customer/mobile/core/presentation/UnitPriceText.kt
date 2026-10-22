package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.effyshopping.customer.mobile.features.catalog.domain.UnitPrice

/**
 * The comparison price, said small and quiet beside a price (098) — on the tile, the product page,
 * the cart line and the saved list. Nothing at all when the platform gave none: a guessed comparison
 * is worse than none.
 */
@Composable
fun UnitPriceText(unit: UnitPrice?, modifier: Modifier = Modifier) {
    if (unit == null) return
    Text(
        unit.text,
        modifier = modifier,
        style = MaterialTheme.typography.bodySmall.copy(fontFeatureSettings = "tnum"),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
