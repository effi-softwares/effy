package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.shop.mobile.features.catalog.domain.GetLowStock
import com.effyshopping.shop.mobile.features.catalog.domain.LowStockItem

/**
 * The restock list (054 US5), at parity with shop-web's `LowStockScreen` (FR-030).
 *
 * ⚠ NO COLOUR CARRIES MEANING. "Out of stock" and "Low" are words and weight — 041 removed an amber
 * warning colour from this app's sibling screens, and a tablet on a shop floor in bright light is the
 * worst possible place to depend on a tint.
 *
 * ⚠ Rows, not cards (Principle V), and the whole point is that restocking becomes a decision made
 * from a list rather than from a customer complaint.
 */
@Composable
fun LowStockRoute(getLowStock: GetLowStock, onOpenProduct: (String) -> Unit = {}) {
    val viewModel = viewModel { LowStockViewModel(getLowStock) }
    val state by viewModel.state.collectAsState()
    LowStockScreen(state, onOpenProduct)
}

@Composable
fun LowStockScreen(state: LowStockUiState, onOpenProduct: (String) -> Unit = {}) {
    Column(
        modifier = Modifier.fillMaxSize().padding(EffySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Text("Restock", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Everything out of stock, and everything at or below its low-stock threshold. " +
                "Products you do not track never appear here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        when {
            state.isLoading -> Text("Loading…", style = MaterialTheme.typography.bodyMedium)
            state.message != null -> Text(
                state.message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
            state.items.isEmpty() -> Text(
                "Nothing needs restocking right now.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                items(state.items, key = { it.productId }) { item ->
                    LowStockRow(item, onOpenProduct)
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun LowStockRow(item: LowStockItem, onOpenProduct: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onOpenProduct(item.productId) }
            .padding(vertical = EffySpacing.s),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(item.name, style = MaterialTheme.typography.bodyLarge)
            Text(
                buildString {
                    append(item.sku ?: "No SKU")
                    append(" · ")
                    append(item.onHand)
                    append(" in stock")
                    item.effectiveThreshold?.let { append(" · threshold $it") }
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            if (item.outOfStock) "Out of stock" else "Low",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (item.outOfStock) FontWeight.SemiBold else null,
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}
