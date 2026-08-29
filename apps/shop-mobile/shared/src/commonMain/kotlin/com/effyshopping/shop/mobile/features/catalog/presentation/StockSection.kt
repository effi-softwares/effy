package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.effyshopping.shop.mobile.features.catalog.domain.OPERATOR_STOCK_REASONS
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStock
import com.effyshopping.shop.mobile.features.catalog.domain.StockMovement
import com.effyshopping.shop.mobile.features.catalog.domain.StockReason
import com.effyshopping.mobile.design.EffySpacing

/**
 * The Inventory tab (054 US1), at parity with shop-web's `StockPanel` (FR-030).
 *
 * ⚠ NO COLOUR CARRIES MEANING HERE. "Out of stock" and "Running low" are words and weight, never a
 * hue — 041 removed an amber "warning" colour from this app's sibling screens and the platform has
 * exactly two semantic colours, neither of which means "running low". A tablet in a bright shop is
 * also the worst possible place to depend on a tint.
 *
 * ⚠ Detail ROWS, not cards (Principle V), matching the Overview pane directly above it.
 */
@Composable
fun StockSection(
    state: StockUiState,
    onEnableTracking: () -> Unit,
    onDisableTracking: () -> Unit,
    onOpeningCountChange: (String) -> Unit,
    onModeChange: (StockChangeMode) -> Unit,
    onAmountChange: (String) -> Unit,
    onReasonChange: (StockReason) -> Unit,
    onSubmitAmount: () -> Unit,
    onThresholdChange: (String) -> Unit,
    onSubmitThreshold: () -> Unit,
    onClearThreshold: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
        Text(
            "STOCK",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (state.isLoading) {
            Text("Loading stock…", style = MaterialTheme.typography.bodyMedium)
            return@Column
        }

        val stock = state.stock
        if (stock == null) {
            Text(
                state.message ?: "Stock could not be loaded.",
                style = MaterialTheme.typography.bodyMedium,
            )
            return@Column
        }

        StockSummary(stock)

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Track stock", style = MaterialTheme.typography.bodyLarge)
            Switch(
                checked = stock.tracked,
                // ⚠ FR-003 in the UI: tracking cannot be enabled without an opening count. Enabling
                // without one would make the product instantly unbuyable with no operator intent
                // behind it — a state the shop would hear about from a customer, not from their
                // own action.
                enabled = !state.isSaving && (stock.tracked || state.canEnableTracking),
                onCheckedChange = { on -> if (on) onEnableTracking() else onDisableTracking() },
            )
        }

        if (!stock.tracked) {
            OutlinedTextField(
                value = state.openingCount,
                onValueChange = onOpeningCountChange,
                label = { Text("Opening count") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.width(200.dp),
            )
            Text(
                "Enter how many you have, then switch tracking on.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            HorizontalDivider()
            CountEditor(state, onModeChange, onAmountChange, onReasonChange, onSubmitAmount)
            HorizontalDivider()
            ThresholdEditor(stock, state, onThresholdChange, onSubmitThreshold, onClearThreshold)
        }

        state.message?.let { message ->
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        HorizontalDivider()
        StockHistory(state.movements)
    }
}

/** The one-line answer to "what does this screen say about this product right now". */
@Composable
private fun StockSummary(stock: ProductStock) {
    val text = when {
        !stock.tracked -> "Not tracked — this product can be bought without limit."
        stock.outOfStock -> "Out of stock — shoppers cannot buy this right now."
        stock.low -> "Running low — ${stock.onHand} left."
        else -> "${stock.onHand} in stock."
    }
    Text(
        text,
        style = MaterialTheme.typography.bodyLarge,
        // Weight, not colour. See the file header.
        fontWeight = if (stock.outOfStock || stock.low) androidx.compose.ui.text.font.FontWeight.SemiBold else null,
        color = MaterialTheme.colorScheme.onBackground,
    )
}

@Composable
private fun CountEditor(
    state: StockUiState,
    onModeChange: (StockChangeMode) -> Unit,
    onAmountChange: (String) -> Unit,
    onReasonChange: (StockReason) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        Text("Update the count", style = MaterialTheme.typography.titleMedium)

        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            ChoiceChip("Add or remove", state.mode == StockChangeMode.ADJUST) {
                onModeChange(StockChangeMode.ADJUST)
            }
            ChoiceChip("Set exact count", state.mode == StockChangeMode.SET) {
                onModeChange(StockChangeMode.SET)
            }
        }

        OutlinedTextField(
            value = state.amount,
            onValueChange = onAmountChange,
            label = { Text(if (state.mode == StockChangeMode.SET) "New count" else "Change by") },
            placeholder = { Text(if (state.mode == StockChangeMode.SET) "0" else "e.g. 24 or -3") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.width(220.dp),
        )

        Text("Reason", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            OPERATOR_STOCK_REASONS.forEach { reason ->
                ChoiceChip(reasonLabel(reason), state.reason == reason) { onReasonChange(reason) }
            }
        }

        Button(onClick = onSubmit, enabled = !state.isSaving && state.canSubmitAmount) {
            Text(if (state.isSaving) "Saving…" else "Record")
        }
    }
}

@Composable
private fun ThresholdEditor(
    stock: ProductStock,
    state: StockUiState,
    onThresholdChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onClear: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        Text("Low-stock threshold", style = MaterialTheme.typography.titleMedium)
        Text(
            when {
                stock.threshold != null ->
                    "This product has its own threshold of ${stock.threshold}, which overrides the shop default."
                stock.effectiveThreshold != null ->
                    "Using the shop default of ${stock.effectiveThreshold}."
                else ->
                    "No threshold set for this product or for the shop, so nothing is reported as running low. " +
                        "A product that reaches zero is still reported as out of stock."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = state.thresholdInput,
            onValueChange = onThresholdChange,
            label = { Text("Threshold") },
            placeholder = { Text("Shop default") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.width(200.dp),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Button(onClick = onSubmit, enabled = !state.isSaving) { Text("Save") }
            if (stock.threshold != null) {
                // ⚠ Clears to NULL, never zero. "I have no opinion" and "warn me at zero" are
                // different instructions, and zero would make the product permanently "low".
                TextButton(onClick = onClear, enabled = !state.isSaving) { Text("Use shop default") }
            }
        }
    }
}

@Composable
private fun StockHistory(movements: List<StockMovement>) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        Text("History", style = MaterialTheme.typography.titleMedium)
        if (movements.isEmpty()) {
            Text(
                "No stock changes recorded yet. Every change to the count appears here, with who made it and why.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Column
        }
        movements.forEach { m ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
            ) {
                Text(
                    formatDelta(m.quantityDelta),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.width(56.dp),
                )
                Column(Modifier.weight(1f)) {
                    Text(reasonLabel(m.reason), style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "${m.quantityBefore} → ${m.quantityAfter} · ${actorLabel(m)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/** A signed number, so an increase and a reduction are told apart without colour. */
internal fun formatDelta(delta: Int): String = when {
    delta > 0 -> "+$delta"
    else -> delta.toString()
}

internal fun reasonLabel(reason: StockReason): String = when (reason) {
    StockReason.RECEIVED -> "Stock received"
    StockReason.CORRECTION -> "Correction"
    StockReason.DAMAGE -> "Damaged"
    StockReason.EXPIRY -> "Expired"
    StockReason.ORDER_PAID -> "Sold"
    StockReason.PICK_SHORTFALL -> "Short at picking"
    StockReason.TRACKING_ENABLED -> "Tracking turned on"
    StockReason.TRACKING_DISABLED -> "Tracking turned off"
}

/**
 * ⚠ FR-027: a shop must see plainly when back-office changed their numbers on their behalf. That is
 * why the actor is its own field rather than a reason value — back-office should not have to pick a
 * reason that says "back-office did this".
 */
internal fun actorLabel(m: StockMovement): String = when (m.actor) {
    com.effyshopping.shop.mobile.features.catalog.domain.StockActor.SYSTEM ->
        m.orderNumber?.let { "Order $it" } ?: "Automatic"
    com.effyshopping.shop.mobile.features.catalog.domain.StockActor.BACK_OFFICE ->
        m.actorLabel?.let { "$it (Effy support)" } ?: "Effy support"
    com.effyshopping.shop.mobile.features.catalog.domain.StockActor.SHOP -> m.actorLabel ?: "—"
}

@Composable
private fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) {
    androidx.compose.material3.FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
    )
}
