package com.effyshopping.driver.mobile.core.platform

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * The run, drawn (060 US3 — **FR-023e's recorded fallback, now the primary implementation**).
 *
 * ⚠ **MAPLIBRE WAS ADOPTED AND THEN REMOVED, on operator decision.** It rendered real OpenStreetMap
 * cartography via OpenFreeMap and worked at runtime — but **aborted the app under Xcode's debug
 * build** with `SIGABRT` on its own render thread (`RenderSessionHandle.kt`, around
 * `Kotlin_mm_switchThreadStateNative_debug`). MapLibre Compose is **pre-1.0**; the fault is in its
 * own threading between native render callbacks and the Kotlin/Native runtime, and it is not
 * fixable from this repository. An app that cannot be run from Xcode is not a workable basis for
 * the remaining development of this surface.
 *
 * ⚠ **AND THE PLATFORM HAD NOTHING TO PLOT ANYWAY.** 049 R13: shops carry no address or
 * coordinates, and orders carry an un-geocoded address. Real cartography was always going to
 * display genuine streets with **invented pins** on them. What a driver actually routes with is
 * **Navigate**, which hands the device's own maps app the real address string — and that is
 * untouched.
 *
 * So this draws the *shape* of the run — the thing the design's own map frames communicate: how
 * many stops, in what order, ending where. ⚠ It is deliberately **abstract rather than
 * map-like**: a stylised route that looked like real geography would imply positions the platform
 * does not know, which is exactly the lie FR-015 exists to prevent.
 *
 * Consequences, recorded rather than discovered later: **no tile requests, no attribution
 * obligation, no vendor key, no pre-1.0 dependency, and nothing to crash.**
 */
@Composable
fun EffyMapCanvas(modifier: Modifier = Modifier, stopCount: Int = 0, endsAtHub: Boolean = false) {
    val line = MaterialTheme.colorScheme.onSurfaceVariant
    val accent = MaterialTheme.colorScheme.primary
    val ground = MaterialTheme.colorScheme.surfaceVariant
    val onGround = MaterialTheme.colorScheme.surface

    Box(modifier) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(ground)

            // A faint grid: enough to read as "a plan of somewhere" without implying streets.
            val step = 44.dp.toPx()
            var x = 0f
            while (x < size.width) {
                drawLine(onGround, Offset(x, 0f), Offset(x, size.height), strokeWidth = 2f)
                x += step
            }
            var y = 0f
            while (y < size.height) {
                drawLine(onGround, Offset(0f, y), Offset(size.width, y), strokeWidth = 2f)
                y += step
            }

            val points = routePoints(stopCount, endsAtHub)
            if (points.isEmpty()) return@Canvas

            val pad = 40.dp.toPx()
            val w = size.width - pad * 2
            val h = size.height - pad * 2
            val placed = points.map { Offset(pad + it.x * w, pad + it.y * h) }

            // The route, as an orthogonal path — a schematic, never a road.
            val path = Path().apply {
                moveTo(placed.first().x, placed.first().y)
                var cursor = placed.first()
                placed.drop(1).forEach { p ->
                    // Orthogonal: across, then down. A schematic, never a road.
                    lineTo(p.x, cursor.y)
                    lineTo(p.x, p.y)
                    cursor = p
                }
            }
            drawPath(path, accent, style = Stroke(width = 3.5.dp.toPx(), cap = StrokeCap.Round))

            placed.forEachIndexed { index, p ->
                val isHub = endsAtHub && index == placed.lastIndex
                if (isHub) {
                    // ⚠ The hub is a SQUARE, ordinary stops are circles (FR-023d). A different
                    // shape, not a different colour: the hub is a different kind of place, and
                    // colour alone does not survive a sunlit windscreen mount.
                    val s = 9.dp.toPx()
                    drawRect(onGround, topLeft = Offset(p.x - s, p.y - s), size = androidx.compose.ui.geometry.Size(s * 2, s * 2))
                    drawRect(
                        accent,
                        topLeft = Offset(p.x - s, p.y - s),
                        size = androidx.compose.ui.geometry.Size(s * 2, s * 2),
                        style = Stroke(width = 3.dp.toPx()),
                    )
                } else {
                    drawCircle(onGround, radius = 8.dp.toPx(), center = p)
                    drawCircle(accent, radius = 8.dp.toPx(), center = p, style = Stroke(width = 3.dp.toPx()))
                }
            }
        }
    }
}

/**
 * Normalised (0..1) positions for a run of [stopCount] stops.
 *
 * ⚠ **A LAYOUT, NOT A LOCATION.** These are evenly distributed along a gentle zig-zag so the
 * schematic is legible at any count. They encode order and nothing else — no geography is implied
 * and none is available (049 R13).
 */
private fun routePoints(stopCount: Int, endsAtHub: Boolean): List<Offset> {
    val total = stopCount + if (endsAtHub) 1 else 0
    if (total <= 0) return emptyList()
    if (total == 1) return listOf(Offset(0.5f, 0.5f))
    return (0 until total).map { i ->
        val t = i.toFloat() / (total - 1)
        Offset(x = t, y = if (i % 2 == 0) 0.25f else 0.75f)
    }
}
