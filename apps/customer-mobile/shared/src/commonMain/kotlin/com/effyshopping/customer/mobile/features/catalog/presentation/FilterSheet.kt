package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.features.catalog.domain.Facet
import com.effyshopping.customer.mobile.features.catalog.domain.FacetControl
import com.effyshopping.mobile.design.EffySpacing

/**
 * The advanced filter bottom sheet (043 US1). Opened from the filter icon in the Search header; holds
 * every facet — the offers toggle, price band, a single-select category, and the multi-select brand +
 * characteristic facets, each option showing its count (043 US2). Filters apply LIVE on each tap
 * (the ViewModel re-runs the search), so the primary action simply closes and shows the results.
 *
 * Built on [EffySheet], which owns the modal sheet, scroll, insets, title and the primary/cancel pair.
 * Standard Material 3 controls only (Checkbox/RadioButton) — no experimental layout APIs.
 */
@Composable
fun FilterSheet(
    state: SearchUiState,
    onDismiss: () -> Unit,
    onToggleSale: () -> Unit,
    onCategory: (String?) -> Unit,
    onToggleBrand: (String) -> Unit,
    onToggleAttribute: (key: String, value: String) -> Unit,
    onApplyPrice: (String?, String?) -> Unit,
    onClearAll: () -> Unit,
) {
    val facetSet = state.facetSet
    val category = facetSet?.facets?.firstOrNull { it.key == "category" && it.control == FacetControl.SINGLE_SELECT }
    val multiFacets = facetSet?.facets?.filter { it.control == FacetControl.MULTI_SELECT }.orEmpty()

    EffySheet(
        title = "Filters",
        onDismiss = onDismiss,
        primaryLabel = state.total?.let { "Show $it results" } ?: "Show results",
        onPrimary = onDismiss,
    ) {
        // Offers — a fixed toggle (not a server facet in this slice).
        SectionTitle("Offers")
        CheckRow(label = "On sale", checked = state.saleOnly, count = null, onToggle = onToggleSale)

        // Price band — corrects an inverted range before applying (FR-004).
        SectionTitle("Price")
        PriceRangeRow(
            min = state.minPrice.orEmpty(),
            max = state.maxPrice.orEmpty(),
            hintMin = facetSet?.priceBounds?.min,
            hintMax = facetSet?.priceBounds?.max,
            onApply = onApplyPrice,
        )

        // Category — single select, with an explicit "All".
        if (category != null && category.options.isNotEmpty()) {
            SectionTitle(category.label)
            RadioRow(label = "All categories", selected = state.categoryKey == null) { onCategory(null) }
            category.options.forEach { option ->
                RadioRow(
                    label = option.label,
                    count = option.count,
                    selected = state.categoryKey == option.value,
                ) { onCategory(option.value) }
            }
        }

        // Brand + characteristic facets — multi-select, OR within.
        multiFacets.forEach { facet ->
            val selectedValues = if (facet.key == "brand") state.brands else state.attributes[facet.key].orEmpty()
            FacetSection(
                facet = facet,
                selectedValues = selectedValues,
                onToggle = { value ->
                    if (facet.key == "brand") onToggleBrand(value) else onToggleAttribute(facet.key, value)
                },
            )
        }

        if (facetSet != null && facetSet.facets.isEmpty() && !state.facetsLoading) {
            Text(
                "No filters for this result set.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (state.activeFilterCount > 0) {
            TextButton(onClick = onClearAll, modifier = Modifier.fillMaxWidth()) {
                Text("Clear all filters")
            }
        }
    }
}

@Composable
private fun FacetSection(facet: Facet, selectedValues: List<String>, onToggle: (String) -> Unit) {
    SectionTitle(facet.label)
    facet.options.forEach { option ->
        CheckRow(
            label = option.label,
            count = option.count,
            checked = option.value in selectedValues,
            onToggle = { onToggle(option.value) },
        )
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.fillMaxWidth().padding(EffySpacing.xs),
    )
}

@Composable
private fun CheckRow(label: String, count: Int?, checked: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Checkbox(checked = checked, onCheckedChange = { onToggle() })
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        if (count != null) {
            Text(
                count.toString(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RadioRow(label: String, count: Int? = null, selected: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        RadioButton(selected = selected, onClick = onSelect)
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        if (count != null) {
            Text(
                count.toString(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PriceRangeRow(
    min: String,
    max: String,
    hintMin: String?,
    hintMax: String?,
    onApply: (String?, String?) -> Unit,
) {
    var lo by remember(min) { mutableStateOf(min) }
    var hi by remember(max) { mutableStateOf(max) }
    // Keep the fields in step when the applied bounds change elsewhere (e.g. Clear all).
    LaunchedEffect(min, max) {
        lo = min
        hi = max
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        OutlinedTextField(
            value = lo,
            onValueChange = { lo = it },
            placeholder = { Text(hintMin ?: "Min") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = hi,
            onValueChange = { hi = it },
            placeholder = { Text(hintMax ?: "Max") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.weight(1f),
        )
        TextButton(
            onClick = {
                var a = lo.trim()
                var b = hi.trim()
                // FR-004: correct an inverted range rather than sending it (which would match nothing).
                if (a.isNotEmpty() && b.isNotEmpty() && (a.toDoubleOrNull() ?: 0.0) > (b.toDoubleOrNull() ?: 0.0)) {
                    val t = a; a = b; b = t
                    lo = a; hi = b
                }
                onApply(a.ifBlank { null }, b.ifBlank { null })
            },
            modifier = Modifier.width(64.dp),
        ) {
            Text("Go")
        }
    }
}
