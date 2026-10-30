package com.effyshopping.customer.mobile.features.deliveryinstructions.presentation

import com.effyshopping.customer.mobile.core.presentation.EffyChip
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
import com.effyshopping.customer.mobile.core.presentation.EffySize
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.Icon
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_house
import com.effyshopping.customer.mobile.resources.lucide_user_round

/**
 * The delivery-instructions control: two handover choices and a note for the driver. Used by
 * checkout and by the address form, so an address's saved default is edited with the very control
 * that will later be prefilled from it (Principle II).
 *
 * Stateless - the draft lives in the caller's ViewModel, which is what lets it survive the move to
 * the payment screen and a failed payment.
 *
 * The chips toggle off. "No preference" is a real answer, and a control that cannot return to it
 * forces a shopper who tapped one by mistake to live with it.
 *
 * The note is plain text in and plain text out; nothing here or downstream parses it.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DeliveryInstructionsField(
    draft: InstructionsDraft,
    onChange: (InstructionsDraft) -> Unit,
    modifier: Modifier = Modifier,
    /** Null when the caller already headed the section (checkout's numbered card). */
    title: String? = "Delivery instructions",
    hint: String? = "Optional. Your driver sees this when they deliver.",
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        if (title != null) Text(title, style = MaterialTheme.typography.titleMedium)
        if (hint != null) Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        // 087 (Checkout board): the two handover choices as one two-part control, each half with its
        // icon; the chosen half is tinted. It still toggles off - "no preference" is a real answer.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(EffyStorefrontShape.card)
                .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.card)
                .selectableGroup(),
        ) {
            Handover.entries.forEachIndexed { index, choice ->
                val selected = draft.handover == choice
                if (index > 0) Box(Modifier.width(1.dp).height(EffySize.target + 4.dp).background(MaterialTheme.colorScheme.outline))
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = EffySize.target + 4.dp)
                        .background(if (selected) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.background)
                        .selectable(selected = selected, role = Role.RadioButton) {
                            onChange(draft.copy(handover = if (selected) null else choice))
                        }
                        .padding(horizontal = EffySpacing.s),
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.s, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        painterResource(if (index == 0) Res.drawable.lucide_house else Res.drawable.lucide_user_round),
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(choice.label, style = MaterialTheme.typography.labelMedium.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium))
                }
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
 * Instructions as read-only text - the receipt. Draws nothing at all when there are none: an order
 * placed before 066 must look exactly as it did.
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
