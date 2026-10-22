package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.mobile.design.EffySpacing

/**
 * A chip — filters, sort, list names, handover choices, sub-aisles (Results, Saved, Checkout boards).
 *
 * 6dp corners (the storefront's controls are never pills), 40dp visual inside a 48dp target. Selected
 * is the light-blue tint with a blue border and blue label, so the state is carried by fill, edge and
 * colour together, never by colour alone.
 *
 * [unavailable] (098 — a sold-out size) strikes the label through and says "sold out" to a screen
 * reader: it stays pressable, because choosing it shows the shopper that size is sold out.
 */
@Composable
fun EffyChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    unavailable: Boolean = false,
) {
    val interactions = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .heightIn(min = EffySize.target)
            .effyPress(interactions)
            .selectable(selected = selected, interactionSource = interactions, indication = null, role = Role.Tab, onClick = onClick)
            .then(if (unavailable) Modifier.semantics { stateDescription = "sold out" } else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .heightIn(min = 40.dp)
                .clip(EffyStorefrontShape.control)
                .background(if (selected) EffyRoles.primaryMuted else MaterialTheme.colorScheme.background)
                .border(
                    1.dp,
                    if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                    EffyStorefrontShape.control,
                )
                .padding(horizontal = EffySpacing.md, vertical = EffySpacing.s),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium.copy(textDecoration = if (unavailable) TextDecoration.LineThrough else null),
                color = when {
                    selected -> MaterialTheme.colorScheme.primary
                    unavailable -> MaterialTheme.colorScheme.onSurfaceVariant
                    else -> MaterialTheme.colorScheme.onSurface
                },
                maxLines = 1,
            )
        }
    }
}

/**
 * The segmented control — Ongoing / Completed, Recent / Available / Aisle (Orders, Saved boards).
 * A white thumb SLIDES between equal segments on a zinc track (200ms; instant under reduced motion).
 */
@Composable
fun <T> EffySegmentedToggle(
    options: List<T>,
    selected: T,
    label: (T) -> String,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    val index = options.indexOf(selected).coerceAtLeast(0)
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = EffySize.target)
            .clip(EffyStorefrontShape.card)
            .background(EffySurface.tint)
            .padding(3.dp),
    ) {
        val segment = maxWidth / options.size.coerceAtLeast(1)
        val offset by animateDpAsState(segment * index, tween(effyDuration(EffyStorefrontMotion.StandardMillis)), label = "segment")
        Box(
            modifier = Modifier
                .offset(x = offset)
                .width(segment)
                .height(42.dp)
                .shadow(1.dp, EffyStorefrontShape.control)
                .clip(EffyStorefrontShape.control)
                .background(MaterialTheme.colorScheme.background),
        )
        Row(modifier = Modifier.fillMaxWidth().height(42.dp)) {
            options.forEach { option ->
                val active = option == selected
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(EffyStorefrontShape.control)
                        .selectable(selected = active, role = Role.Tab, onClick = { onSelect(option) }),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label(option),
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium),
                        color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** A row that is a checkbox — the whole row is the target (60dp). */
@Composable
fun EffyCheckboxRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    trailing: String? = null,
    enabled: Boolean = true,
) {
    SelectionRow(
        modifier = modifier.toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = onCheckedChange),
        label = label, supporting = supporting, trailing = trailing,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = CheckboxDefaults.colors(
                checkedColor = MaterialTheme.colorScheme.primary,
                uncheckedColor = MaterialTheme.colorScheme.onSurfaceVariant,
                checkmarkColor = MaterialTheme.colorScheme.onPrimary,
            ),
        )
    }
}

/** A row that is a radio choice — the whole row is the target (60dp). */
@Composable
fun EffyRadioRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    trailing: String? = null,
    enabled: Boolean = true,
) {
    SelectionRow(
        modifier = modifier.selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick),
        label = label, supporting = supporting, trailing = trailing,
    ) {
        RadioButton(
            selected = selected,
            onClick = null,
            enabled = enabled,
            colors = RadioButtonDefaults.colors(
                selectedColor = MaterialTheme.colorScheme.primary,
                unselectedColor = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        )
    }
}

/** A row with a switch on the right — the whole row toggles it (60dp). */
@Composable
fun EffySwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    enabled: Boolean = true,
    /** Inside a group the row is inset; inside a sheet it lines up with the sheet's own edge (0). */
    horizontalPadding: androidx.compose.ui.unit.Dp = EffySpacing.lg,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = EffySize.target + 4.dp)
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
            .padding(horizontal = horizontalPadding, vertical = EffySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            if (supporting != null) {
                Text(supporting, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                checkedTrackColor = MaterialTheme.colorScheme.primary,
                checkedBorderColor = MaterialTheme.colorScheme.primary,
                uncheckedThumbColor = MaterialTheme.colorScheme.background,
                uncheckedTrackColor = MaterialTheme.colorScheme.outline,
                uncheckedBorderColor = MaterialTheme.colorScheme.outline,
            ),
        )
    }
}

@Composable
private fun SelectionRow(
    modifier: Modifier,
    label: String,
    supporting: String?,
    trailing: String?,
    control: @Composable () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            // 48dp: the minimum target. A list of choices in a sheet reads as a list at this height;
            // at 60dp plus the sheet's gaps it read as a stack of separate controls.
            .heightIn(min = EffySize.target),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs),
    ) {
        control()
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            if (supporting != null) {
                Text(supporting, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (trailing != null) {
            Text(
                trailing,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = EffySpacing.s),
            )
        }
    }
}
