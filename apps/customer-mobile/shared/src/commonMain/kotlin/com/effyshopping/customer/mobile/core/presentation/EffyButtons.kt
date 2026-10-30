package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/**
 * The primary action - full width, Effy blue, 52dp, 6dp corners (Foundations board).
 *
 * [destructive] draws it black: the storefront has no red, so a destructive action is said with its
 * words and an icon, never a hue (constitution v3.3.0). [loading] puts the spinner inside the button
 * and keeps the label, so the shopper still reads what they are waiting for.
 */
@Composable
fun EffyPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
    loading: Boolean = false,
    destructive: Boolean = false,
) {
    val interactions = remember { MutableInteractionSource() }
    val fill = when {
        !enabled -> EffyDisabled.fill
        destructive -> MaterialTheme.colorScheme.onSurface
        else -> MaterialTheme.colorScheme.primary
    }
    val fg = if (enabled) MaterialTheme.colorScheme.onPrimary else EffyDisabled.label
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = EffySize.primary)
            .effyPress(interactions)
            .clip(EffyStorefrontShape.control)
            .background(fill)
            .clickable(
                enabled = enabled && !loading,
                interactionSource = interactions,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = EffySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) EffyButtonSpinner(fg) else leading?.invoke()
        Text(label, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), color = fg)
    }
}

/** The secondary action - white inside a hairline border, 48dp. */
@Composable
fun EffySecondaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    leading: (@Composable () -> Unit)? = null,
) {
    val interactions = remember { MutableInteractionSource() }
    val fg = if (enabled) MaterialTheme.colorScheme.onSurface else EffyDisabled.label
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = EffySize.secondary)
            .effyPress(interactions)
            .clip(EffyStorefrontShape.control)
            .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control)
            .clickable(
                enabled = enabled && !loading,
                interactionSource = interactions,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = EffySpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), verticalAlignment = Alignment.CenterVertically) {
            if (loading) EffyButtonSpinner(fg) else leading?.invoke()
            Text(label, style = MaterialTheme.typography.labelLarge, color = fg)
        }
    }
}

/**
 * A quiet, full-width action - "Cancel", "Stay signed in", "Skip". 48dp target, no border.
 * [color] defaults to the text colour; pass `primary` for a blue text action.
 */
@Composable
fun EffyGhostButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = MaterialTheme.colorScheme.onSurface,
    leading: DrawableResource? = null,
) {
    val interactions = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .heightIn(min = EffySize.target)
            .effyPress(interactions)
            .clip(EffyStorefrontShape.control)
            .clickable(enabled = enabled, interactionSource = interactions, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = EffySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val fg = if (enabled) color else EffyDisabled.label
        if (leading != null) Icon(painterResource(leading), contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, color = fg, textAlign = TextAlign.Center)
    }
}

/** A blue text action inside content - "See all", "Change", "Need a specific time?". 48dp target. */
@Composable
fun EffyTextLink(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Box(
        modifier = modifier
            .heightIn(min = EffySize.target)
            .clip(EffyStorefrontShape.control)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = EffySpacing.md),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (enabled) MaterialTheme.colorScheme.primary else EffyDisabled.label,
        )
    }
}

/** The in-button progress mark. */
@Composable
internal fun EffyButtonSpinner(color: Color) {
    CircularProgressIndicator(modifier = Modifier.size(18.dp), color = color, strokeWidth = 2.dp)
}

/** "Or" between two ways of doing one thing: hairline - word - hairline. */
@Composable
fun EffyOrDivider(label: String = "Or", modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.outlineVariant)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider(modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/**
 * The inline link line - "Don't have an account? Join". The action is blue (the storefront's link
 * colour) and 48dp tall; [enabled] dims it while a request is in flight rather than removing it.
 */
@Composable
fun EffyInlineLink(
    prompt: String,
    action: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(0.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(prompt, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        EffyTextLink(action, onClick = onClick, enabled = enabled)
    }
}
