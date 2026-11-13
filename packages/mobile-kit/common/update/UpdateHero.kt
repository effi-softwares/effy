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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** The colours [UpdateHero] is drawn in - each app passes its own theme's, so this file holds no colour of its own. */
data class UpdateHeroColors(
    /** The app icon's ground (the splash's near-black). */
    val tile: Color,
    /** A hairline around the tile, so it still has an edge on a dark page. */
    val tileEdge: Color,
    /** The soft pulse behind the icon. */
    val pulse: Color,
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
 * so it follows the app's light and dark themes. [mark] draws the letter on the icon ("e." in each app's own type).
 */
@Composable
fun UpdateHero(
    tileSize: Dp,
    colors: UpdateHeroColors,
    animate: Boolean,
    modifier: Modifier = Modifier,
    mark: @Composable () -> Unit,
) {
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
    val drop by loop.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1_600, easing = FastOutSlowInEasing), RepeatMode.Restart),
        label = "drop",
    )

    val canvas = tileSize * 1.9f
    val badgeSize = tileSize * 0.40f
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
            ) { mark() }

            // The badge on the icon's corner, with the arrow dropping into its tray.
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = badgeSize * 0.28f, y = badgeSize * 0.28f)
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
                    val stroke = Stroke(width = w * 0.085f, cap = StrokeCap.Round)
                    // The arrow falls a short way, fades at the bottom and starts again from the top.
                    val travel = if (animate) w * 0.14f else 0f
                    val t = if (animate) drop else 0.5f
                    val dy = -travel / 2f + travel * t
                    val fade = if (animate) (if (t < 0.8f) 1f else (1f - t) / 0.2f) else 1f
                    val ink = colors.badgeInk.copy(alpha = colors.badgeInk.alpha * fade)
                    val cx = w / 2f
                    val top = w * 0.27f + dy
                    val tip = w * 0.60f + dy
                    drawLine(ink, Offset(cx, top), Offset(cx, tip), strokeWidth = stroke.width, cap = StrokeCap.Round)
                    drawLine(ink, Offset(cx - w * 0.14f, tip - w * 0.14f), Offset(cx, tip), strokeWidth = stroke.width, cap = StrokeCap.Round)
                    drawLine(ink, Offset(cx + w * 0.14f, tip - w * 0.14f), Offset(cx, tip), strokeWidth = stroke.width, cap = StrokeCap.Round)
                    // The tray it drops into stays still.
                    val trayY = w * 0.74f
                    drawLine(colors.badgeInk, Offset(cx - w * 0.2f, trayY), Offset(cx + w * 0.2f, trayY), strokeWidth = stroke.width, cap = StrokeCap.Round)
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
