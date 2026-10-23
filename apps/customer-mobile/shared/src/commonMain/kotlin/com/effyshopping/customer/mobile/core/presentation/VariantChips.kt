package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.effyshopping.customer.mobile.features.catalog.domain.SelectorRow
import com.effyshopping.customer.mobile.features.catalog.domain.ValueState
import com.effyshopping.mobile.design.EffySpacing

/**
 * The size selector on the product page: one row of chips per option ("Size: 1 kg"), drawn
 * from [VariantSelection.rows] so the app and the storefront offer the same choices. A sold-out value
 * stays, struck through and announced. Nothing at all for a product sold one way.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VariantChips(rows: List<SelectorRow>, onPick: (slot: Int, valueId: String) -> Unit, modifier: Modifier = Modifier) {
    if (rows.isEmpty()) return
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
        for (row in rows) {
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                val chosen = row.values.firstOrNull { it.selected }?.value
                Text(
                    if (chosen != null) "${row.option.name}: $chosen" else row.option.name,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    for (v in row.values) {
                        EffyChip(
                            label = v.value,
                            selected = v.selected,
                            unavailable = v.state == ValueState.SoldOut,
                            onClick = { onPick(row.slot, v.id) },
                        )
                    }
                }
            }
        }
    }
}
