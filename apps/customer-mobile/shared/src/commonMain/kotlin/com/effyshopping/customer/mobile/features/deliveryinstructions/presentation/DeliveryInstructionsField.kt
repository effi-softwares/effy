package com.effyshopping.customer.mobile.features.deliveryinstructions.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.Handover
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.clampToNoteMax
import com.effyshopping.mobile.design.EffySpacing

/**
 * The delivery-instructions control (066): two handover choices and a note for the driver. Used by
 * checkout and by the address form, so an address's saved default is edited with the very control
 * that will later be prefilled from it (Principle II).
 *
 * Stateless — the draft lives in the caller's ViewModel, which is what lets it survive the move to
 * the payment screen and a failed payment (FR-006).
 *
 * ⚠ The chips TOGGLE OFF. "No preference" is a real answer, and a control that cannot return to it
 * forces a shopper who tapped one by mistake to live with it.
 *
 * ⚠ The note is plain text in and plain text out; nothing here or downstream parses it.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DeliveryInstructionsField(
    draft: InstructionsDraft,
    onChange: (InstructionsDraft) -> Unit,
    modifier: Modifier = Modifier,
    title: String = "Delivery instructions",
    hint: String = "Optional. Your driver sees this when they deliver.",
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        FlowRow(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Handover.entries.forEach { choice ->
                val selected = draft.handover == choice
                FilterChip(
                    selected = selected,
                    onClick = { onChange(draft.copy(handover = if (selected) null else choice)) },
                    label = { Text(choice.label) },
                    // 48 dp: a shopper does this one-handed, standing in a kitchen.
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
        }

        EffyField(
            label = "Note for the driver",
            value = draft.note,
            onValueChange = { onChange(draft.copy(note = it.clampToNoteMax())) },
            placeholder = "Gate code, which door, where to leave it",
            singleLine = false,
        )
        Text(
            "${draft.remaining} characters left",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            // Polite: a screen reader hears the count settle, not every keystroke.
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/**
 * Instructions as READ-ONLY text — the receipt. Draws nothing at all when there are none: an order
 * placed before 066 must look exactly as it did (SC-003).
 */
@Composable
fun DeliveryInstructionsText(handover: Handover?, note: String?, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        handover?.let { Text(it.label, style = MaterialTheme.typography.bodyMedium) }
        note?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
