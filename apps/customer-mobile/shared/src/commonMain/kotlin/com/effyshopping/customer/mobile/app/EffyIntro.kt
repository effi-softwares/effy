package com.effyshopping.customer.mobile.app

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.platform.StatusBarIcons
import com.effyshopping.customer.mobile.core.platform.platformTag
import androidx.compose.runtime.derivedStateOf
import com.effyshopping.customer.mobile.core.presentation.EffyStorefrontMotion
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.mobile.kit.ui.LocalMotionLevel
import com.effyshopping.mobile.kit.ui.MotionLevel
import kotlinx.coroutines.flow.first

/**
 * The launch intro - the native splash's "e." becomes "effy." letter by letter, then hands over to
 * the app.
 *
 * The first frame is the native splash, pixel for pixel, so the swap is invisible. The splash is the
 * brand's "e." mark (packages/brand `logo.svg`) on #09090B: the wordmark's own "e" and full stop, ×5,
 * centred in an 836.67-unit canvas that the platform draws at 192pt (iOS `LaunchLogo`, centred in the
 * safe area) or 288dp (Android's splash icon, centred in the window). This draws the same letter shapes
 * - outlined from Geist Bold in `packages/brand/src/wordmark.svg`, copied below - at the same size, in
 * the same place, on the same ground (`--foreground`, which IS #09090B).
 *
 * Then the full stop leads: e. → ef. → eff. → effy. - in three steps the dot slides right and drags the
 * next letter out from behind the previous one (clipped at that letter's right edge, so nothing shows
 * through the e's counter), each step on the iOS curve; the word drifts so it stays centred. After a short hold - and only once the
 * session is known, so the app never appears half-restored - the ground turns white and the word black
 * (the light app's colours), and the intro fades away.
 *
 * Lightweight: five paths parsed once, one animated clock, drawn in a Canvas - the clock is read only
 * in the draw phase, so a frame redraws and nothing recomposes. Reduce motion: the letters fade in
 * where they belong (no sliding); no motion at all: the finished wordmark, then straight to the app.
 */
@Composable
internal fun EffyIntro(ready: Boolean, darkTheme: Boolean, onFinished: () -> Unit) {
    val motion = LocalMotionLevel.current
    val clock = remember { Animatable(0f) }
    val readyState = rememberUpdatedState(ready)
    val finished = rememberUpdatedState(onFinished)
    val letters = remember { IntroLetters() }

    LaunchedEffect(Unit) {
        if (motion == MotionLevel.None) {
            clock.snapTo(REVEALED_MS)
        } else {
            clock.animateTo(REVEALED_MS, tween(REVEALED_MS.toInt(), easing = LinearEasing))
        }
        // Hold the finished word until the session is known.
        snapshotFlow { readyState.value }.first { it }
        clock.animateTo(END_MS, tween((END_MS - REVEALED_MS).toInt(), easing = LinearEasing))
        finished.value()
    }

    // Light status-bar icons while the ground is dark; dark again once it has turned white (halfway
    // through the colour change). `derivedStateOf`, so this recomposes twice, not every frame.
    val darkTheme by rememberUpdatedState(darkTheme)
    val darkGround by remember { derivedStateOf { darkTheme || clock.value < HOLD_END_MS + COLOUR_MS / 2f } }
    StatusBarIcons(lightIcons = darkGround)

    val ios = remember { platformTag() == "ios" }
    // From the splash's fixed colours to the app's: white ground + black word on the light theme; on the
    // dark theme the ground stays near-black and the word white.
    val dark = EffyRoles.splashGround // #09090B - the splash ground (packages/brand SPLASH_GROUND)
    val light = MaterialTheme.colorScheme.background
    val splashInk = EffyRoles.splashInk
    val appInk = MaterialTheme.colorScheme.onSurface
    val green = EffyRoles.brand

    Box(Modifier.fillMaxSize().clearAndSetSemantics {}) {
        Canvas(Modifier.fillMaxSize()) {
            val t = clock.value
            val handover = ease(phase(t, HOLD_END_MS, COLOUR_MS))
            val fade = phase(t, HOLD_END_MS + COLOUR_MS, FADE_MS)
            drawRect(lerp(dark, light, handover).copy(alpha = 1f - fade))
        }
        BoxWithConstraints(
            // iOS centres its launch image in the safe area; Android centres the splash in the window.
            Modifier.fillMaxSize().then(if (ios) Modifier.windowInsetsPadding(WindowInsets.safeDrawing) else Modifier),
        ) {
            val canvasDp = if (ios) 192f else 288f
            val unitDp = 5f * canvasDp / SPLASH_CANVAS_UNITS
            // A phone too narrow for the full word at splash size eases down to fit as the word grows.
            val fitDp = ((maxWidth.value - 48f) / WORD_WIDTH).coerceAtMost(unitDp)
            Canvas(Modifier.fillMaxSize()) {
                val t = clock.value
                val reduced = motion != MotionLevel.Full
                val p = FloatArray(3) { i -> if (motion == MotionLevel.None) 1f else phase(t, LETTER_START_MS + i * STEP_MS, STEP_MS) }
                val grow = ease(phase(t, LETTER_START_MS, REVEALED_MS - LETTER_START_MS))
                val unit = (unitDp + (fitDp - unitDp) * grow).dp.toPx()
                val handover = ease(phase(t, HOLD_END_MS, COLOUR_MS))
                val fade = phase(t, HOLD_END_MS + COLOUR_MS, FADE_MS)
                val ink = lerp(splashInk, appInk, handover).copy(alpha = 1f - fade)
                val dot = green.copy(alpha = 1f - fade)
                letters.draw(this, p, reduced, unit, ink, dot)
            }
        }
    }
}

private const val SPLASH_CANVAS_UNITS = 836.6667f
private const val WORD_WIDTH = 198.2f
private const val LETTER_START_MS = 150f
/** One step of the dot: e. → ef. → eff. → effy. - three steps, one after another. */
private const val STEP_MS = 230f
private const val REVEALED_MS = LETTER_START_MS + 3 * STEP_MS + 250f // + a short hold
private const val HOLD_END_MS = REVEALED_MS
private const val COLOUR_MS = 260f
private const val FADE_MS = 220f
private const val END_MS = HOLD_END_MS + COLOUR_MS + FADE_MS

/** 0 → 1 across [start, start + length]. */
private fun phase(t: Float, start: Float, length: Float) = ((t - start) / length).coerceIn(0f, 1f)
private fun ease(x: Float) = EffyStorefrontMotion.IosEase.transform(x)

/** The wordmark's letters, in wordmark units (viewBox 198.2 × 86), with their horizontal extents. */
private class IntroLetters {
    private val parser = PathParser()
    private fun path(d: String): Path = parser.parsePathString(d).toPath()

    private val e = path(PATH_E)
    private val f1 = path(PATH_F1)
    private val f2 = path(PATH_F2)
    private val y = path(PATH_Y)
    private val dot = path(PATH_DOT)

    // Right edges of e, f, f, y - read off the outlines.
    private val rights = floatArrayOf(53.1f, 91.5f, 131.3f, 186.2f)
    private val trailing = listOf(f1, f2, y)

    /**
     * The dot leads: e. → ef. → eff. → effy. Each step the full stop slides right to where it will sit after
     * the next letter, which is dragged behind it a fixed gap before the dot, emerging from behind the previous
     * letter (clipped at that letter's right edge). A letter stops at its place; the dot moves on. The splash's
     * "e." spans 0 … 75.3 and centres on 44.2 vertically; the word keeps that line and stays centred.
     */
    fun draw(scope: DrawScope, p: FloatArray, reduced: Boolean, unit: Float, ink: Color, dotColour: Color) = with(scope) {
        // Where the dot rests after each step: 6 units after e, f, f - and tucked into the y's tail.
        val q = FloatArray(3) { ease(p[it]) }
        var dotLeft = DOT_REST[0]
        for (i in 1..3) dotLeft += (DOT_REST[i] - DOT_REST[i - 1]) * q[i - 1]

        val offset = FloatArray(4)
        for (i in 1..3) {
            offset[i] = if (reduced) {
                0f
            } else {
                // The gap between this letter and the dot: 6 while dragged, closing to its final gap.
                val gap = DOT_GAP + (DOT_REST[i] - rights[i] - DOT_GAP) * q[i - 1]
                minOf(0f, dotLeft - gap - rights[i])
            }
        }
        val centreX = (0f + dotLeft + DOT_WIDTH) / 2f

        translate(size.width / 2f - centreX * unit, size.height / 2f - 44.2f * unit) {
            scale(unit, unit, pivot = Offset.Zero) {
                drawPath(e, ink)
                for (i in 1..3) {
                    val alpha = if (reduced) p[i - 1] else 1f
                    if (alpha <= 0f) continue
                    // Clip at the previous letter's current right edge: the letter emerges from behind it.
                    val clipLeft = if (reduced) -1000f else rights[i - 1] + offset[i - 1]
                    clipRect(left = clipLeft, top = -1000f, right = 1000f, bottom = 1000f) {
                        translate(offset[i], 0f) { drawPath(trailing[i - 1], ink.copy(alpha = ink.alpha * alpha)) }
                    }
                }
                translate(dotLeft - DOT_FINAL_LEFT, 0f) { drawPath(dot, dotColour) }
            }
        }
    }

    private companion object {
        const val DOT_GAP = 6f // the splash's gap between the e and the full stop
        const val DOT_WIDTH = 16.2f
        const val DOT_FINAL_LEFT = 182f
        /** The dot's resting left edge after e, f, f, y (the last is its place in the wordmark). */
        val DOT_REST = floatArrayOf(53.1f + DOT_GAP, 91.5f + DOT_GAP, 131.3f + DOT_GAP, DOT_FINAL_LEFT)
    }
}

// The wordmark's outlines, from packages/brand/src/wordmark.svg (Geist Bold, outlined)
// Copied, not loaded: five short path strings cost nothing at launch, and loading the SVG would need
// a resource read before the very first frame. If the wordmark is ever redrawn, copy these again.
private const val PATH_E = "M0 44.2Q0 35.8 3.3 29.45Q6.6 23.1 12.7 19.65Q18.8 16.2 26.9 16.2Q34.8 16.2 40.75 19.7Q46.7 23.2 49.9 29.75Q53.1 36.3 53.1 45.2V48.2H15.5Q15.7 54.4 18.8 57.6Q21.9 60.8 27.3 60.8Q31.1 60.8 33.65 59.2Q36.2 57.6 37.3 54.3L52.4 55.2Q50.2 63.2 43.45 67.7Q36.7 72.2 27 72.2Q18.9 72.2 12.75 68.75Q6.6 65.3 3.3 58.95Q0 52.6 0 44.2ZM26.9 27.3Q22.1 27.3 19.1 30.4Q16.1 33.5 15.5 39H37.8Q37.5 33.3 34.6 30.3Q31.7 27.3 26.9 27.3Z"
private const val PATH_F1 = "M80.1 0H91.5V11.2H83.3Q80.2 11.2 78.8 12.7Q77.4 14.2 77.4 17.4V71H62.4V16.7Q62.4 8.6 66.8 4.3Q71.2 0 80.1 0ZM54.6 19.4H90.7V30.6H54.6Z"
private const val PATH_F2 = "M119.9 0H131.3V11.2H123.1Q120 11.2 118.6 12.7Q117.2 14.2 117.2 17.4V71H102.2V16.7Q102.2 8.6 106.6 4.3Q111 0 119.9 0ZM94.4 19.4H130.5V30.6H94.4Z"
private const val PATH_Y = "M140.7 74.8H147.8Q150.3 74.8 151.55 74.05Q152.8 73.3 153.5 71.4L154.7 68.3H150.6L131.7 17.4H147.1L159.3 54.3L170.9 17.4H186.2L165.6 76.1Q163.7 81.4 160.35 83.7Q157 86 150.9 86H140.7Z"
private const val PATH_DOT = "M182 55.7H198.2V71H182Z"
