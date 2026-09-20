// Single-select chip row (060 FR-021, FR-023).
//
// Two places in the driver app ask a closed question the driver answers with one tap while holding a
// parcel: "where did you leave it?" (contactless proof — Front door / Reception / Mailroom / With a
// neighbour) and "what's wrong with this package?" (the shop problem report).
//
// ⚠ These replace FREE TEXT, and that is a correctness change, not styling. A typed answer cannot be
// aggregated, cannot be matched against a customer's claim, and on a phone at a doorstep it is
// mostly not typed at all. A closed set also means the platform can later act on the answer without
// parsing prose.
package com.effyshopping.mobile.kit.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

/**
 * A wrapping row of mutually-exclusive choices.
 *
 * ⚠ Uses `Role.RadioButton` rather than `Role.Button`: a screen reader then announces "selected" /
 * "not selected" and the fact that these are alternatives. As plain buttons they would be read as
 * four unrelated actions.
 *
 * @param options what the driver may choose from, in the order the design lists them
 * @param selected the current choice, or null if none has been made
 * @param onSelect fired with the chosen option
 * @param enabled when false the row is inert
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun <T> ChoiceChips(
    options: List<T>,
    selected: T?,
    onSelect: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            Box(
                modifier = Modifier
                    // 48 dp minimum height — the constitution's fat-finger rule. A chip is small by
                    // nature, so its TARGET is padded out even though its ink is not.
                    .defaultMinSize(minHeight = 48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(
                        if (isSelected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.surface
                        },
                    )
                    .border(
                        width = 1.5.dp,
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.outlineVariant
                        },
                        shape = RoundedCornerShape(24.dp),
                    )
                    .selectable(
                        selected = isSelected,
                        enabled = enabled,
                        role = Role.RadioButton,
                        onClick = { onSelect(option) },
                    )
                    .padding(horizontal = 18.dp, vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label(option),
                    style = MaterialTheme.typography.labelLarge,
                    color = if (isSelected) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                )
            }
        }
    }
}
