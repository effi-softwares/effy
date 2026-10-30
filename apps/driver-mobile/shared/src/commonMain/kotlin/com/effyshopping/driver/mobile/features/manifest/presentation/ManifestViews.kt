package com.effyshopping.driver.mobile.features.manifest.presentation

import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.withStyle
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
import androidx.compose.runtime.staticCompositionLocalOf
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
 * The manifest's shared views - used by the shop pickup and the customer drop.
 *
 * The class is carried by a word and a shape, never by colour. Every icon here is
 * drawn in the text colour and differs from the others in outline - a six-armed star, a droplet, a
 * box, a ring - so it reads the same in greyscale, in direct sunlight and to a colour-blind driver.
 * There is deliberately no blue-for-cold: Principle V gives the platform one action colour, and a
 * driver glancing at a van-mounted phone should not have to tell two blues apart.
 */

/** One class: its icon and its word. The unit of meaning everything else here is built from. */
@Composable
fun ClassChip(temperatureClass: TemperatureClass, count: Int? = null, modifier: Modifier = Modifier) {
    val tint = MaterialTheme.colorScheme.onSurface
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

/**
 * Every line of one package. List rows, not cards (Principle V).
 *
 * Nothing is dropped to make it fit. A long name wraps under itself; the quantity and the
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
        // "Not included" is said in words. A strikethrough alone is invisible to a screen reader
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
 * The toggle is its own 48 dp target and is not the row above it: on the pickup screen the row
 * confirms the package, and a driver opening the list must not tick a package they have not loaded.
 */
/**
 * Told when a driver opens a package's item list: whether cold goods are in it, and how many lines.
 * An ambient rather than a parameter because the list sits four composables deep on two screens,
 * and what it reports is telemetry, not behaviour. Never an item name or an order reference.
 */
val LocalManifestOpened = staticCompositionLocalOf<(hasCold: Boolean, lineCount: Int) -> Unit> { { _, _ -> } }



/**
 * Rev 2 - a package's items in a grey rounded box (the redesign's shop stop and drop): "2× Greek
 * yoghurt 1kg", the cold class on the right. A line the shop could not supply is struck through and says so.
 */
@Composable
fun ManifestBox(items: List<ManifestLine>, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier.fillMaxWidth().clip(com.effyshopping.driver.mobile.design.EffyStorefrontShape.card).background(scheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (items.isEmpty()) {
            Text("No items in this package", style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant)
        }
        items.forEach { line ->
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    androidx.compose.ui.text.buildAnnotatedString {
                        withStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.SemiBold)) { append("${line.qty}× ") }
                        append(line.name)
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    textDecoration = if (!line.included) androidx.compose.ui.text.style.TextDecoration.LineThrough else null,
                    color = if (!line.included) scheme.onSurfaceVariant else scheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                val side = when {
                    !line.included -> "Not included"
                    line.partSupplied -> "${line.qty} of ${line.orderedQty}"
                    line.temperatureClass == TemperatureClass.Frozen || line.temperatureClass == TemperatureClass.Chilled -> line.temperatureClass.label
                    else -> null
                }
                side?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp, top = 2.dp)) }
            }
        }
    }
}
