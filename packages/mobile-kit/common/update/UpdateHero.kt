package com.effyshopping.mobile.kit.update

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** The colours [UpdateHero] is drawn in - each app passes its own theme's, so this file holds no colour of its own. */
/**
 * The mark on the icon, drawn from the brand's own shapes (`packages/brand/src/logo.svg`, `logo-driver.svg`, 500×500): the
 * wordmark's "e" and, after it, the app's own full stop - a square for the customer app, a steering wheel for the driver
 * app. Copied, not typed in a font, so it is the app icon exactly. ⚠ Change the brand file first, then copy it here.
 */
enum class UpdateMark(internal val dot: String) {
    Customer("M357.25 307.5H438.25V384H357.25Z"),
    Driver("M357 338A46 46 0 1 1 449 338A46 46 0 1 1 357 338ZM372 338A31 31 0 1 0 434 338A31 31 0 1 0 372 338ZM390 338A13 13 0 1 1 416 338A13 13 0 1 1 390 338ZM371 331H391V345H371ZM415 331H435V345H415ZM396 349H410V370H396Z"),
    ;

    internal companion object {
        const val E = "M61.75 250Q61.75 208 78.25 176.25Q94.75 144.5 125.25 127.25Q155.75 110 196.25 110Q235.75 110 265.5 127.5Q295.25 145 311.25 177.75Q327.25 210.5 327.25 255V270H139.25Q140.25 301 155.75 317Q171.25 333 198.25 333Q217.25 333 230 325Q242.75 317 248.25 300.5L323.75 305Q312.75 345 279 367.5Q245.25 390 196.75 390Q156.25 390 125.5 372.75Q94.75 355.5 78.25 323.75Q61.75 292 61.75 250ZM196.25 165.5Q172.25 165.5 157.25 181Q142.25 196.5 139.25 224H250.75Q249.25 195.5 234.75 180.5Q220.25 165.5 196.25 165.5Z"
        const val VIEWBOX = 500f
    }
}

data class UpdateHeroColors(
    /** The app icon's ground (the splash's near-black). */
    val tile: Color,
    /** A hairline around the tile, so it still has an edge on a dark page. */
    val tileEdge: Color,
    /** The soft pulse behind the icon. */
    val pulse: Color,
    /** The icon's letter, and its full stop. */
    val markInk: Color,
    val markDot: Color,
    /** The update badge and its arrow. */
    val badge: Color,
    val badgeInk: Color,
    /** The page colour, cut around the badge so it sits on the tile's corner cleanly. */
    val page: Color,
)

/**
 * 121: the update screens' picture - the app's own icon (so it is clear the update is Effy's), a soft pulse spreading
 * behind it, and a round badge on its corner with an arrow that drops into a tray, again and again.
 *
 * On first show the icon settles in on a spring and the badge pops onto its corner. With [animate] false (reduced
 * motion) everything is drawn in its resting place and nothing moves. Drawn in code - no image files - from [colors],
 * so it follows the app's light and dark themes; the icon's "e." is the brand's own shapes ([mark]).
 */
@Composable
fun UpdateHero(
    tileSize: Dp,
    colors: UpdateHeroColors,
    mark: UpdateMark,
    animate: Boolean,
    modifier: Modifier = Modifier,
) {
    val letter = remember { PathParser().parsePathString(UpdateMark.E).toPath() }
    val dot = remember(mark) { PathParser().parsePathString(mark.dot).toPath() }
    val enter = remember { Animatable(if (animate) 0f else 1f) }
    val badgeIn = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        enter.animateTo(1f, spring(dampingRatio = 0.62f, stiffness = Spring.StiffnessLow))
    }
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        kotlinx.coroutines.delay(260)
        badgeIn.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMediumLow))
    }

    val loop = rememberInfiniteTransition(label = "update-hero")
    val pulse by loop.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2_600, easing = LinearEasing), RepeatMode.Restart),
        label = "pulse",
    )
    // The arrow bobs down into the tray and back - always visible.
    val drop by loop.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "drop",
    )

    val canvas = tileSize * 1.9f
    val badgeSize = tileSize * 0.46f
    Box(
        modifier = modifier.size(canvas).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        // The pulse: a still halo, and two rings that spread out from the icon and fade, half a beat apart.
        Canvas(Modifier.size(canvas)) {
            val centre = center
            val base = tileSize.toPx() * 0.62f
            val reach = size.minDimension / 2f
            drawCircle(colors.pulse.copy(alpha = colors.pulse.alpha * 0.10f), radius = base * 1.18f, center = centre)
            if (animate) {
                for (offset in listOf(0f, 0.5f)) {
                    val t = (pulse + offset) % 1f
                    drawCircle(
                        color = colors.pulse.copy(alpha = colors.pulse.alpha * 0.32f * (1f - t)),
                        radius = base + (reach - base) * t,
                        center = centre,
                        style = Stroke(width = 1.5.dp.toPx()),
                    )
                }
            } else {
                drawCircle(colors.pulse.copy(alpha = colors.pulse.alpha * 0.18f), radius = base * 1.45f, center = centre, style = Stroke(1.5.dp.toPx()))
            }
        }

        // The icon, settling in.
        Box(
            modifier = Modifier
                .size(tileSize)
                .graphicsLayer {
                    val s = 0.82f + 0.18f * enter.value
                    scaleX = s
                    scaleY = s
                    alpha = enter.value.coerceIn(0f, 1f)
                },
        ) {
            Box(
                modifier = Modifier
                    .size(tileSize)
                    .clip(RoundedCornerShape(tileSize * 0.24f))
                    .background(colors.tile)
                    .border(1.dp, colors.tileEdge, RoundedCornerShape(tileSize * 0.24f)),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.size(tileSize)) {
                    val k = size.width / UpdateMark.VIEWBOX
                    scale(k, k, pivot = Offset.Zero) {
                        drawPath(letter, colors.markInk)
                        drawPath(dot, colors.markDot)
                    }
                }
            }

            // The badge on the icon's corner, with the arrow dropping into its tray.
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = badgeSize * 0.24f, y = badgeSize * 0.24f)
                    .size(badgeSize)
                    .graphicsLayer {
                        scaleX = badgeIn.value
                        scaleY = badgeIn.value
                    }
                    .border(3.dp, colors.page, CircleShape)
                    .clip(CircleShape)
                    .background(colors.badge),
            ) {
                Canvas(Modifier.size(badgeSize)) {
                    val w = size.width
                    val sw = w * 0.11f
                    // The arrow bobs a little way down towards the tray and back; the tray stays still.
                    val dy = if (animate) (drop - 0.5f) * w * 0.10f else 0f
                    val cx = w / 2f
                    val top = w * 0.22f + dy
                    val tip = w * 0.58f + dy
                    val wing = w * 0.17f
                    drawLine(colors.badgeInk, Offset(cx, top), Offset(cx, tip), strokeWidth = sw, cap = StrokeCap.Round)
                    drawLine(colors.badgeInk, Offset(cx - wing, tip - wing), Offset(cx, tip), strokeWidth = sw, cap = StrokeCap.Round)
                    drawLine(colors.badgeInk, Offset(cx + wing, tip - wing), Offset(cx, tip), strokeWidth = sw, cap = StrokeCap.Round)
                    val trayY = w * 0.76f
                    drawLine(colors.badgeInk, Offset(cx - w * 0.22f, trayY), Offset(cx + w * 0.22f, trayY), strokeWidth = sw, cap = StrokeCap.Round)
                }
            }
        }
    }
}

/**
 * The words under the picture arrive one after another, a short rise and fade each ([index] 0, 1, 2…), once. With
 * [animate] false they are simply there.
 */
@Composable
fun Modifier.updateEnter(index: Int, animate: Boolean): Modifier {
    val progress = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        kotlinx.coroutines.delay(120L + index * 70L)
        progress.animateTo(1f, tween(420, easing = FastOutSlowInEasing))
    }
    return this.graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * 14.dp.toPx()
    }
}
