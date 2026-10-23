package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_chevron_right
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/**
 * A group — white, 1dp hairline border, 8dp corners, with an optional caption above (Account,
 * Security, Checkout boards). Rows inside are separated by hairlines via [EffyGroupDivider].
 *
 * Card layouts are permitted on the storefront identity (constitution v3.3.0); a group is the
 * storefront's sectioned list, not a dashboard tile.
 */
@Composable
fun EffyGroup(
    modifier: Modifier = Modifier,
    caption: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        if (caption != null) {
            Text(
                caption,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = EffySpacing.xs, bottom = EffySpacing.s),
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(EffyStorefrontShape.card)
                .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.card)
                .background(MaterialTheme.colorScheme.background),
            content = content,
        )
    }
}

/** The hairline between two rows in a group. */
@Composable
fun EffyGroupDivider() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/**
 * A navigation row — icon, label, optional second line, chevron. 60dp (64 with a second line).
 *
 * [destructive] keeps the storefront rule: no red. The label is black and semibold with the word
 * itself saying what it does ("Delete account"); the icon carries the rest.
 */
@Composable
fun EffyNavRow(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    supporting: String? = null,
    destructive: Boolean = false,
    showChevron: Boolean = true,
    divider: Boolean = true,
    trailingText: String? = null,
    enabled: Boolean = true,
) {
    val tint = if (enabled) MaterialTheme.colorScheme.onSurface else EffyDisabled.label
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = if (supporting != null) EffySize.rowWithSubtitle else EffySize.row)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            if (leading != null) {
                CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurfaceVariant) { leading() }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontWeight = if (destructive) FontWeight.SemiBold else FontWeight.Medium,
                    ),
                    color = tint,
                )
                if (supporting != null) {
                    Text(supporting, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (trailingText != null) {
                Text(trailingText, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (showChevron) EffyChevron()
        }
        if (divider) EffyHairline()
    }
}

/** A leading row icon (Lucide, 20dp, muted). */
@Composable
fun EffyRowIcon(icon: DrawableResource, modifier: Modifier = Modifier) {
    Icon(painterResource(icon), contentDescription = null, modifier = modifier.size(20.dp), tint = LocalContentColor.current)
}

/** The trailing chevron (Lucide chevron-right). */
@Composable
fun EffyChevron(modifier: Modifier = Modifier) {
    Icon(
        painterResource(Res.drawable.lucide_chevron_right),
        contentDescription = null,
        modifier = modifier.size(20.dp),
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/**
 * The borderless list row — image · name · meta · price, with a trailing slot (cart lines, saved
 * items). 72dp image on the zinc well.
 */
@Composable
fun EffyListRow(
    name: String,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
    meta: String? = null,
    price: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .heightIn(min = EffySize.row)
            .padding(vertical = EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        if (imageUrl != null) {
            Box(modifier = Modifier.size(72.dp).clip(EffyStorefrontShape.card).background(EffySurface.tint)) {
                ProductImage(imageUrl, name, modifier = Modifier.fillMaxSize())
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (meta != null) Text(meta, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (price != null) Text(price, modifier = Modifier.padding(top = EffySpacing.xs), style = MaterialTheme.typography.titleSmall)
        }
        if (trailing != null) trailing()
    }
}

/** A label/value detail row — order summaries and item specifics. Values are tabular. */
@Composable
fun EffyDetailRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    emphasised: Boolean = false,
    valueColor: androidx.compose.ui.graphics.Color = androidx.compose.ui.graphics.Color.Unspecified,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            label,
            modifier = Modifier.weight(1f, fill = false),
            style = if (emphasised) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyLarge,
            color = if (emphasised) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(EffySpacing.md))
        Text(
            value,
            style = (if (emphasised) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge)
                .copy(fontFeatureSettings = "tnum"),
            color = valueColor,
        )
    }
}

/**
 * A tappable label / value / chevron row — Personal info's editing affordance. Label above
 * value; `editable = false` drops the chevron and shows [trailingNote], so a tap is never silent.
 */
@Composable
fun EffyValueRow(
    label: String,
    value: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    editable: Boolean = true,
    placeholder: String = "Not set",
    trailingNote: String? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = EffySize.rowWithSubtitle)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                value?.takeIf { it.isNotBlank() } ?: placeholder,
                style = MaterialTheme.typography.bodyLarge,
                color = if (value.isNullOrBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(EffySpacing.md))
        if (editable) {
            EffyChevron()
        } else if (trailingNote != null) {
            Text(trailingNote, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
