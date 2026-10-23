package com.effyshopping.driver.mobile.core.map

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.presentation.LocalReducedMotion
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_house
import com.effyshopping.driver.mobile.resources.lucide_truck
import org.jetbrains.compose.resources.vectorResource
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * The run map: a decorative mini map of a run's stops. Not a map: no tiles, SDK, key, pan or zoom; drawn
 * from the stops' rough points (their postcodes' places), so it works offline and follows the theme.
 *
 * - The ground is a made-up street grid seeded by [seed] (the run id), so a run always looks the same.
 * - The route is straight lines between stops (across then up), solid where driven, dashed ahead; the van
 *  sits 45% along the current leg.
 * - Shops are blue rounded squares, customers green circles, the hub a dark square.
 * - Motion (the route draws, dashes drift, pins pop in, the next stop pulses) only when [animate] and
 *  reduced motion is off.
 *
 * [flush] draws it edge to edge inside a card.
 */
@Composable
fun RunMapView(
    map: RunMap,
    seed: String,
    description: String,
    modifier: Modifier = Modifier,
    height: Dp = 210.dp,
    flush: Boolean = false,
    animate: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    val moving = animate && !LocalReducedMotion.current
    val shape = if (flush) RoundedCornerShape(0.dp) else RoundedCornerShape(12.dp)

    // motion clocks
    val draw = remember(seed) { Animatable(if (moving) 0f else 1f) }
    val pins = remember(seed) { Animatable(if (moving) 0f else 10_000f) }
    // The dashed route ahead fades in after half a second.
    val ahead = remember(seed) { Animatable(if (moving) 0f else 1f) }
    LaunchedEffect(seed, moving) {
        if (!moving) return@LaunchedEffect
        ahead.animateTo(1f, tween(300, delayMillis = 500))
    }
    LaunchedEffect(seed, moving) {
        if (!moving) return@LaunchedEffect
        draw.animateTo(1f, tween(700, easing = FastOutSlowInEasing))
    }
    LaunchedEffect(seed, moving) {
        if (!moving) return@LaunchedEffect
        pins.animateTo(10_000f, tween(10_000, easing = LinearEasing))
    }
    val loop = rememberInfiniteTransition(label = "run-map")
    val dashPhase by loop.animateFloat(0f, -20f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "dash")
    val pulse by loop.animateFloat(0f, 1f, infiniteRepeatable(tween(1800, easing = LinearEasing), RepeatMode.Restart), label = "pulse")

    val measurer = rememberTextMeasurer()
    val house = rememberVectorPainter(vectorResource(Res.drawable.lucide_house))
    val truck = rememberVectorPainter(vectorResource(Res.drawable.lucide_truck))
    val layout = remember(seed) { GroundLayout.of(seed) }

    val ground = scheme.surfaceVariant
    val street = scheme.background
    val ink = scheme.onSurface
    val paper = scheme.background
    val shop = scheme.primary
    val customer = EffyRoles.brand
    val park = EffyRoles.brandMuted
    val water = EffyRoles.primaryMuted

    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(shape)
            .then(if (flush) Modifier else Modifier.border(1.dp, scheme.outlineVariant, shape))
            .background(ground)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .semantics {
                contentDescription = description
                if (onClick != null) role = Role.Button
            },
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawGround(layout, street, park, water)
            val placed = place(map.stops, size)
            drawRoute(placed, map.stops, ink, draw.value, ahead.value, if (moving) dashPhase else 0f, truck, paper)
            placed.forEachIndexed { i, p ->
                val s = map.stops[i]
                // Pins pop in one after another: 0 → 1.15 → 1 over 350 ms, 50 ms apart.
                val t = ((pins.value - i * 50f) / 350f).coerceIn(0f, 1f)
                val scale = if (t < 0.6f) 1.15f * (t / 0.6f) else 1.15f - 0.15f * ((t - 0.6f) / 0.4f)
                if (scale <= 0f) return@forEachIndexed
                val fill = when (s.kind) {
                    RunMapStop.Kind.SHOP -> shop
                    RunMapStop.Kind.CUSTOMER -> customer
                    RunMapStop.Kind.HUB -> ink
                }
                if (moving && s.status == RunMapStop.Status.NEXT) {
                    val r = 11.dp.toPx() * (1f + 1.8f * pulse)
                    drawCircle(fill.copy(alpha = 0.55f * (1f - pulse)), radius = r, center = p)
                }
                drawPin(p, s, fill, paper, scale, measurer, house)
            }
        }
        Legend(map, shop, customer, ink, Modifier.align(Alignment.BottomStart).padding(10.dp))
    }
}

// layout

/** The made-up ground: grid spacings, the main roads, a park and a water edge — fixed per seed. */
private class GroundLayout(
    val vertical: List<Float>,
    val horizontal: List<Float>,
    val mainV: Float,
    val mainH: Float,
    val diagonal: Pair<Float, Float>,
    val park: Pair<Float, Float>,
    val waterRight: Boolean,
) {
    companion object {
        fun of(seed: String): GroundLayout {
            val rng = Mulberry(seed.hashCode())
            fun steps(): List<Float> {
                val out = mutableListOf<Float>()
                var x = -400f
                while (x < 1400f) {
                    x += 18f + rng.next() * 20f
                    out += x
                }
                return out
            }
            return GroundLayout(
                vertical = steps(),
                horizontal = steps(),
                mainV = 0.2f + rng.next() * 0.25f,
                mainH = 0.3f + rng.next() * 0.3f,
                diagonal = (rng.next() * 0.4f) to (0.6f + rng.next() * 0.4f),
                park = (0.1f + rng.next() * 0.5f) to (0.1f + rng.next() * 0.4f),
                waterRight = rng.next() > 0.3f,
            )
        }
    }
}

/** A tiny seeded generator (mulberry32), so a run's ground never changes between reads. */
private class Mulberry(seed: Int) {
    private var a = seed
    fun next(): Float {
        a += 0x6D2B79F5
        var t = a
        t = (t xor (t ushr 15)) * (t or 1)
        t = t xor (t + (t xor (t ushr 7)) * (t or 61))
        return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f
    }
}

private fun DrawScope.drawGround(l: GroundLayout, street: Color, park: Color, water: Color) {
    val w = size.width
    val h = size.height
    // The park: one small rounded block in the brand's muted green.
    drawRoundRect(park, topLeft = Offset(l.park.first * w, l.park.second * h), size = Size(70.dp.toPx(), 48.dp.toPx()), cornerRadius = CornerRadius(10.dp.toPx()))
    // The water: one soft curve along an edge.
    val wx = if (l.waterRight) w * 0.88f else w * 0.1f
    val river = Path().apply {
        moveTo(wx, -10f)
        cubicTo(wx + w * 0.06f, h * 0.3f, wx - w * 0.05f, h * 0.65f, wx + w * 0.04f, h + 10f)
    }
    drawPath(river, water, style = Stroke(14.dp.toPx(), cap = StrokeCap.Round))
    // The street grid, turned a little (−9°), and the main roads.
    rotate(-9f) {
        val stroke = 2.dp.toPx()
        l.vertical.forEach { x -> drawLine(street, Offset(x.dp.toPx(), -h), Offset(x.dp.toPx(), h * 2), stroke) }
        l.horizontal.forEach { y -> drawLine(street, Offset(-w, y.dp.toPx()), Offset(w * 2, y.dp.toPx()), stroke) }
        val main = 6.dp.toPx()
        drawLine(street, Offset(w * l.mainV, -h), Offset(w * l.mainV, h * 2), main)
        drawLine(street, Offset(-w, h * l.mainH), Offset(w * 2, h * l.mainH), main)
    }
    drawLine(street, Offset(w * l.diagonal.first, h + 10f), Offset(w * l.diagonal.second, -10f), 6.dp.toPx())
}

/**
 * Where each stop sits: an equirectangular projection (x = lng · cos(mid-latitude), y = −lat), the
 * bounding box fitted into the map with room for the legend, aspect kept, centred. Stops at the same
 * place (one postcode) are spread a little so their pins don't sit on each other.
 */
private fun DrawScope.place(stops: List<RunMapStop>, size: Size): List<Offset> {
    if (stops.isEmpty()) return emptyList()
    val midLat = stops.map { it.point.lat }.average()
    val k = cos(midLat * PI / 180.0)
    val xs = stops.map { it.point.lng * k }
    val ys = stops.map { -it.point.lat }
    val minX = xs.min(); val maxX = xs.max(); val minY = ys.min(); val maxY = ys.max()
    val left = 26.dp.toPx(); val right = 26.dp.toPx(); val top = 22.dp.toPx(); val bottom = 38.dp.toPx()
    val aw = size.width - left - right
    val ah = size.height - top - bottom
    val spanX = max(maxX - minX, 1e-9)
    val spanY = max(maxY - minY, 1e-9)
    val scale = min(aw / spanX, ah / spanY).let { if (it.isInfinite() || it > 1e12) 0.0 else it }
    val usedW = spanX * scale
    val usedH = spanY * scale
    val ox = left + (aw - usedW) / 2
    val oy = top + (ah - usedH) / 2
    val raw = stops.indices.map { i ->
        Offset((ox + (xs[i] - minX) * scale).toFloat(), (oy + (ys[i] - minY) * scale).toFloat())
    }.map { if (scale == 0.0) Offset(left + aw / 2f, top + ah / 2f) else it }
    // Spread pins that land on the same spot around a small ring.
    val ring = 16.dp.toPx()
    val seen = mutableMapOf<Pair<Int, Int>, Int>()
    return raw.map { p ->
        val key = (p.x / 4).toInt() to (p.y / 4).toInt()
        val n = seen.getOrElse(key) { 0 }
        seen[key] = n + 1
        if (n == 0) p else {
            val a = n * 2.1
            Offset((p.x + ring * cos(a)).toFloat(), (p.y + ring * sin(a)).toFloat())
        }
    }
}

/** A leg is across then up (or up then across, alternating), with an 8 dp rounded corner. */
private fun DrawScope.leg(path: Path, a: Offset, b: Offset, acrossFirst: Boolean) {
    val r = min(8.dp.toPx(), min(abs(b.x - a.x), abs(b.y - a.y)) / 2f)
    val corner = if (acrossFirst) Offset(b.x, a.y) else Offset(a.x, b.y)
    if (r < 0.5f) {
        path.lineTo(corner.x, corner.y); path.lineTo(b.x, b.y); return
    }
    val inDir = (corner - a).let { it / max(it.getDistance(), 1e-3f) }
    val outDir = (b - corner).let { it / max(it.getDistance(), 1e-3f) }
    val p1 = corner - inDir * r
    val p2 = corner + outDir * r
    path.lineTo(p1.x, p1.y)
    path.quadraticTo(corner.x, corner.y, p2.x, p2.y)
    path.lineTo(b.x, b.y)
}

private fun DrawScope.drawRoute(
    pts: List<Offset>,
    stops: List<RunMapStop>,
    ink: Color,
    drawn: Float,
    dashedAlpha: Float,
    dashPhase: Float,
    truck: androidx.compose.ui.graphics.vector.VectorPainter,
    paper: Color,
) {
    if (pts.size < 2) return
    // The last finished stop: the route up to it is driven; the leg after it is under way.
    val lastDone = stops.indexOfLast { it.status == RunMapStop.Status.DONE }
    val allDone = stops.all { it.status == RunMapStop.Status.DONE }
    val driven = Path().apply { moveTo(pts[0].x, pts[0].y) }
    val ahead = Path()
    var van: Offset? = null
    for (i in 0 until pts.size - 1) {
        val a = pts[i]; val b = pts[i + 1]
        val across = i % 2 == 0
        when {
            allDone || i < lastDone -> leg(driven, a, b, across)
            i == lastDone -> {
                // Split the current leg at 45% of its length: driven to the van, dashed after it.
                val whole = Path().apply { moveTo(a.x, a.y) }.also { leg(it, a, b, across) }
                val m = PathMeasure().apply { setPath(whole, false) }
                val cut = m.length * 0.45f
                val first = Path(); m.getSegment(0f, cut, first, true)
                val rest = Path(); m.getSegment(cut, m.length, rest, true)
                driven.addPath(first)
                ahead.addPath(rest)
                van = m.getPosition(cut)
            }
            else -> {
                ahead.moveTo(a.x, a.y); leg(ahead, a, b, across)
            }
        }
    }
    if (lastDone < 0 && !allDone) {
        // Not started: nothing driven, the whole route ahead.
        ahead.reset()
        ahead.moveTo(pts[0].x, pts[0].y)
        for (i in 0 until pts.size - 1) leg(ahead, pts[i], pts[i + 1], i % 2 == 0)
    }
    if (dashedAlpha > 0f) {
        drawPath(
            ahead, ink.copy(alpha = 0.45f * dashedAlpha),
            style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 6.dp.toPx()), dashPhase.dp.toPx())),
        )
    }
    if (lastDone >= 0 || allDone) {
        val m = PathMeasure().apply { setPath(driven, false) }
        val part = Path(); m.getSegment(0f, m.length * drawn, part, true)
        drawPath(part, ink, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
    van?.let { v ->
        if (v.x.isNaN()) return@let
        val r = 13.dp.toPx()
        drawCircle(paper, r + 2.dp.toPx(), v)
        drawCircle(ink, r, v)
        translate(v.x - 7.dp.toPx(), v.y - 7.dp.toPx()) {
            with(truck) { draw(Size(14.dp.toPx(), 14.dp.toPx()), colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(paper)) }
        }
    }
}

private fun DrawScope.drawPin(
    p: Offset,
    s: RunMapStop,
    fill: Color,
    paper: Color,
    scale: Float,
    measurer: androidx.compose.ui.text.TextMeasurer,
    house: androidx.compose.ui.graphics.vector.VectorPainter,
) {
    val hub = s.kind == RunMapStop.Kind.HUB
    val side = (if (hub) 26.dp else 22.dp).toPx() * scale
    val ring = 2.dp.toPx() * scale
    val done = s.status == RunMapStop.Status.DONE && !hub
    val alpha = if (done) 0.5f else 1f
    val tl = Offset(p.x - side / 2, p.y - side / 2)
    // A soft shadow, the white ring, then the marker.
    val shadow = Color.Black.copy(alpha = 0.12f)
    if (s.kind == RunMapStop.Kind.CUSTOMER) {
        drawCircle(shadow, side / 2 + ring + 1.dp.toPx(), p + Offset(0f, 1.5.dp.toPx()))
        drawCircle(paper, side / 2 + ring, p)
        drawCircle(fill.copy(alpha = alpha), side / 2, p)
    } else {
        val cr = CornerRadius((if (hub) 7.dp else 6.dp).toPx() * scale)
        drawRoundRect(shadow, tl - Offset(ring, ring - 1.5.dp.toPx()), Size(side + ring * 2, side + ring * 2), cr)
        drawRoundRect(paper, tl - Offset(ring, ring), Size(side + ring * 2, side + ring * 2), cr)
        drawRoundRect(fill.copy(alpha = alpha), tl, Size(side, side), cr)
    }
    if (scale < 0.6f) return
    when {
        hub -> translate(p.x - 7.dp.toPx(), p.y - 7.dp.toPx()) {
            with(house) { draw(Size(14.dp.toPx(), 14.dp.toPx()), colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(paper)) }
        }
        done -> {
            // A white tick instead of the number.
            val u = side / 22f
            val tick = Path().apply {
                moveTo(p.x - 5f * u, p.y)
                lineTo(p.x - 1.5f * u, p.y + 3.5f * u)
                lineTo(p.x + 5f * u, p.y - 3.5f * u)
            }
            drawPath(tick, paper, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        s.n != null -> {
            val text = measurer.measure("${s.n}", TextStyle(color = paper, fontSize = 10.sp, fontWeight = FontWeight.SemiBold))
            drawText(text, topLeft = Offset(p.x - text.size.width / 2f, p.y - text.size.height / 2f))
        }
    }
}

/** The legend pill: only the kinds this map shows. */
@Composable
private fun Legend(map: RunMap, shop: Color, customer: Color, hub: Color, modifier: Modifier) {
    val kinds = map.stops.map { it.kind }.toSet()
    Row(
        modifier.clip(CircleShape).background(MaterialTheme.colorScheme.background).padding(horizontal = 10.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (RunMapStop.Kind.SHOP in kinds) Key("Shops", shop, square = true)
        if (RunMapStop.Kind.CUSTOMER in kinds) Key("Customers", customer, square = false)
        if (RunMapStop.Kind.HUB in kinds) Key("Hub", hub, square = true)
    }
}

@Composable
private fun Key(label: String, colour: Color, square: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(if (square) EffyStorefrontShape.small else CircleShape).background(colour))
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
    }
}

/** The sentence a screen reader says for a run's map (the markers themselves are decorative). */
fun runMapDescription(kind: String, hub: String?, map: RunMap, nextName: String?): String {
    val shops = map.stops.count { it.kind == RunMapStop.Kind.SHOP }
    val customers = map.stops.count { it.kind == RunMapStop.Kind.CUSTOMER }
    val done = map.stops.count { it.kind != RunMapStop.Kind.HUB && it.status == RunMapStop.Status.DONE }
    val places = listOfNotNull(
        shops.takeIf { it > 0 }?.let { if (it == 1) "1 shop" else "$it shops" },
        customers.takeIf { it > 0 }?.let { if (it == 1) "1 customer" else "$it customers" },
    ).joinToString(" and ")
    val from = hub?.takeIf { it.isNotBlank() }?.let { if (kind == "delivery") " from $it" else " ending at $it" } ?: ""
    return "Map of the $kind run$from: $places. $done done" + (nextName?.let { ", next is $it." } ?: ".")
}
