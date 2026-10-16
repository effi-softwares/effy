package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import androidx.compose.foundation.background

/** A small grey heading above a group ("Up next", "Stops, in order"). */
@Composable
fun DriverSectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(bottom = 8.dp).semantics { heading() },
    )
}

/**
 * A bordered group of rows — the canvas's `rounded-lg border` list. Rows inside are separated by
 * hairlines ([DriverRow] draws its own unless it is [DriverRow]'s `last`).
 */
@Composable
fun DriverGroup(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val shape = EffyStorefrontShape.card
    Column(
        modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape),
        content = content,
    )
}

/**
 * One row in a group: an optional leading slot (a number circle, an icon), a title and a meta line, an
 * optional trailing slot (a status pill, a chevron), and a hairline beneath unless [last].
 */
@Composable
fun DriverRow(
    title: String,
    modifier: Modifier = Modifier,
    meta: String? = null,
    last: Boolean = false,
    onClick: (() -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
                .heightIn(min = if (meta != null) DriverSize.rowTall else DriverSize.row)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            leading?.invoke()
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (meta != null) {
                    Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            trailing?.invoke()
        }
        if (!last) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/** The numbered circle that leads a stop or drop row: [fill] / [ink] say done (green), next (blue) or to do (grey). */
@Composable
fun DriverNumberCircle(number: Int, fill: Color, ink: Color) {
    Box(Modifier.size(32.dp).clip(CircleShape).background(fill), contentAlignment = Alignment.Center) {
        Text("$number", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), color = ink)
    }
}

/** A label / value line inside a group (the canvas's `ef-row`). */
@Composable
fun DriverDetailRow(label: String, value: String, last: Boolean = false) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
        }
        if (!last) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}
