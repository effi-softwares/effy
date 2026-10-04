package com.effyshopping.driver.mobile.features.manifest.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.manifest.domain.ManifestLine
import com.effyshopping.driver.mobile.features.manifest.domain.TemperatureClass
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * The manifest's shared views (065) — used by the shop pickup AND the customer drop.
 *
 * ⚠ THE CLASS IS CARRIED BY A WORD AND A SHAPE, NEVER BY COLOUR (FR-011, SC-004). Every icon here is
 * drawn in the text colour and differs from the others in OUTLINE — a six-armed star, a droplet, a
 * box, a ring — so it reads the same in greyscale, in direct sunlight and to a colour-blind driver.
 * There is deliberately no blue-for-cold: Principle V gives the platform one action colour, and a
 * driver glancing at a van-mounted phone should not have to tell two blues apart.
 */

/** One class: its icon and its word. The unit of meaning everything else here is built from. */
@Composable
fun ClassChip(temperatureClass: TemperatureClass, count: Int? = null, modifier: Modifier = Modifier) {
    val tint = if (temperatureClass == TemperatureClass.NotRecorded) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        MaterialTheme.colorScheme.onSurface
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        ClassIcon(temperatureClass, tint)
        Spacer(Modifier.width(6.dp))
        Text(
            if (count == null) temperatureClass.label else "$count ${temperatureClass.label.lowercase()}",
            style = MaterialTheme.typography.labelLarge,
            // Cold goods carry weight; a normal item is the unremarkable case and reads as such.
            fontWeight = if (temperatureClass == TemperatureClass.Frozen || temperatureClass == TemperatureClass.Chilled) {
                FontWeight.SemiBold
            } else {
                FontWeight.Normal
            },
            color = tint,
        )
    }
}

@Composable
private fun ClassIcon(temperatureClass: TemperatureClass, tint: Color) {
    Canvas(Modifier.size(16.dp)) {
        when (temperatureClass) {
            TemperatureClass.Frozen -> snowflake(tint)
            TemperatureClass.Chilled -> droplet(tint)
            TemperatureClass.Normal -> box(tint)
            TemperatureClass.NotRecorded -> dashedRing(tint)
        }
    }
}

private fun DrawScope.snowflake(tint: Color) {
    val c = Offset(size.width / 2f, size.height / 2f)
    val r = size.minDimension / 2f
    val w = size.minDimension / 9f
    for (i in 0 until 3) {
        val a = (i * 60.0) * PI / 180.0
        val d = Offset((cos(a) * r).toFloat(), (sin(a) * r).toFloat())
        drawLine(tint, c - d, c + d, strokeWidth = w, cap = StrokeCap.Round)
    }
}

private fun DrawScope.droplet(tint: Color) {
    val w = size.width
    val h = size.height
    val p = Path().apply {
        moveTo(w / 2f, 0f)
        cubicTo(w * 0.95f, h * 0.45f, w * 0.9f, h, w / 2f, h)
        cubicTo(w * 0.1f, h, w * 0.05f, h * 0.45f, w / 2f, 0f)
        close()
    }
    drawPath(p, tint)
}

private fun DrawScope.box(tint: Color) {
    val inset = size.minDimension / 8f
    drawRect(
        tint,
        topLeft = Offset(inset, inset),
        size = Size(size.width - inset * 2, size.height - inset * 2),
        style = Stroke(width = size.minDimension / 9f),
    )
}

private fun DrawScope.dashedRing(tint: Color) {
    val w = size.minDimension / 9f
    val r = size.minDimension / 2f - w
    val c = Offset(size.width / 2f, size.height / 2f)
    for (i in 0 until 8) {
        val a = (i * 45.0) * PI / 180.0
        drawCircle(tint, radius = w * 0.7f, center = c + Offset((cos(a) * r).toFloat(), (sin(a) * r).toFloat()))
    }
}

/**
 * What a package or a drop holds, readable WITHOUT opening it (FR-013/FR-014).
 *
 * A class with nothing in it is left out (FR-015), so a package of shelf goods shows one quiet chip
 * and nothing that looks like a cold-handling signal.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClassSummaryRow(summary: ClassSummary, modifier: Modifier = Modifier) {
    if (summary.total == 0) {
        Text(
            "No items in this package",
            modifier = modifier,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    FlowRow(
        modifier = modifier.clearAndSetSemantics { contentDescription = summary.spoken },
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        summary.present.forEach { (c, n) -> ClassChip(c, n) }
    }
}

/**
 * Every line of one package. List rows, not cards (Principle V).
 *
 * ⚠ NOTHING IS DROPPED TO MAKE IT FIT (FR-005). A long name wraps under itself; the quantity and the
 * class sit in their own columns so neither can be pushed off the row.
 */
@Composable
fun ManifestList(items: List<ManifestLine>, modifier: Modifier = Modifier) {
    if (items.isEmpty()) {
        Text(
            "No items in this package",
            modifier = modifier.padding(vertical = 8.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    Column(modifier) {
        items.forEach { ManifestRow(it) }
    }
}

@Composable
private fun ManifestRow(line: ManifestLine) {
    val quantity = when {
        !line.included -> "Not included"
        line.partSupplied -> "${line.qty} of ${line.orderedQty}"
        else -> "× ${line.qty}"
    }
    val spoken = when {
        !line.included -> "${line.name}, not included, ${line.temperatureClass.label}"
        line.partSupplied -> "${line.temperatureClass.label}, ${line.qty} of ${line.orderedQty} ${line.name}"
        else -> "${line.temperatureClass.label}, ${line.qty} of ${line.name}"
    }
    val faded = !line.included
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                line.name,
                style = MaterialTheme.typography.bodyLarge,
                color = if (faded) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.padding(top = 4.dp))
            ClassChip(line.temperatureClass)
        }
        Spacer(Modifier.width(12.dp))
        // ⚠ "Not included" is said in WORDS. A strikethrough alone is invisible to a screen reader
        // and easy to miss on a phone in a cradle.
        Text(
            quantity,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (faded) FontWeight.Normal else FontWeight.SemiBold,
            color = if (faded) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
        )
    }
}

/**
 * A package's summary with its lines behind a "Show items" toggle.
 *
 * ⚠ The toggle is its OWN 48 dp target and is not the row above it: on the pickup screen the row
 * confirms the package, and a driver opening the list must not tick a package they have not loaded.
 */
@Composable
fun ExpandableManifest(
    key: String,
    items: List<ManifestLine>,
    summary: ClassSummary,
    modifier: Modifier = Modifier,
    onExpanded: () -> Unit = {},
) {
    var open by rememberSaveable(key) { mutableStateOf(false) }
    Column(modifier) {
        ClassSummaryRow(summary)
        if (items.isNotEmpty()) {
            val count = items.size
            val label = if (open) "Hide items" else "Show $count item${if (count == 1) "" else "s"}"
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable {
                        open = !open
                        if (open) onExpanded()
                    }
                    .semantics { role = Role.Button },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            if (open) ManifestList(items)
        }
    }
}

/**
 * Shown above a list that is the LAST LOADED copy (065 FR-024). The items are real; what the shop
 * changed since is not here, and a driver is owed that sentence rather than a silent stale list.
 */
@Composable
fun StaleNotice(modifier: Modifier = Modifier) {
    Text(
        "No connection — showing the last list loaded.",
        modifier = modifier.padding(bottom = 10.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
