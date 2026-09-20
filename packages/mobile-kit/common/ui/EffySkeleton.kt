// Loading skeletons (060 FR-009, US6).
//
// ⚠ THE RULE THIS FILE EXISTS TO ENFORCE, learned the hard way in 028: a skeleton must be composed
// from the SAME primitives as the content it stands in for. 028 built a rail skeleton out of a `Row`
// where the content used a `LazyRow`, and it could not match — a `Row` allocates width sequentially
// and coerces `Modifier.width()` into whatever is left. The fix was not better numbers, it was the
// same container. So these are PRIMITIVES, deliberately: each screen composes its own skeleton from
// its own layout, and this file only supplies the shimmering blocks.
package com.effyshopping.mobile.kit.ui

import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private const val SHIMMER_PERIOD_MS = 1200

/**
 * The shimmering fill every skeleton block uses.
 *
 * ⚠ [reducedMotion] collapses it to a flat tint rather than removing the block — a driver who has
 * asked the OS for less motion still needs to see that something is loading (FR-009). The app
 * already carries this signal via `PlatformUiController`.
 */
@Composable
fun shimmerBrush(reducedMotion: Boolean = false): Brush {
    val base = MaterialTheme.colorScheme.surfaceVariant
    val highlight = MaterialTheme.colorScheme.surface

    if (reducedMotion) return Brush.linearGradient(listOf(base, base))

    val transition = rememberInfiniteTransition(label = "skeleton")
    val shift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = InfiniteRepeatableSpec(
            animation = tween(SHIMMER_PERIOD_MS),
            repeatMode = RepeatMode.Restart,
        ),
        label = "skeleton-shift",
    )

    // A band sweeping left to right. The travel is generous so the highlight leaves the block
    // entirely at each end instead of appearing to bounce.
    val travel = 900f
    val start = -travel + shift * (travel * 2)
    return Brush.linearGradient(
        colors = listOf(base, highlight, base),
        start = Offset(start, 0f),
        end = Offset(start + travel * 0.6f, 0f),
    )
}

/** A rectangular placeholder — a card, an image, a map strip. */
@Composable
fun SkeletonBlock(
    height: Dp,
    modifier: Modifier = Modifier,
    corner: Dp = 12.dp,
    reducedMotion: Boolean = false,
) {
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(corner))
            .background(shimmerBrush(reducedMotion)),
    )
}

/**
 * A line of placeholder text.
 *
 * @param widthFraction how much of the available width this line occupies. Vary it between lines —
 *   a stack of identical full-width bars reads as a broken layout rather than as loading text.
 */
@Composable
fun SkeletonLine(
    modifier: Modifier = Modifier,
    widthFraction: Float = 1f,
    height: Dp = 13.dp,
    reducedMotion: Boolean = false,
) {
    Box(
        modifier
            .fillMaxWidth(widthFraction)
            .height(height)
            .clip(RoundedCornerShape(height / 2))
            .background(shimmerBrush(reducedMotion)),
    )
}

/** A square placeholder — an avatar, a leading index chip, an icon slot. */
@Composable
fun SkeletonSquare(
    size: Dp,
    modifier: Modifier = Modifier,
    corner: Dp = 10.dp,
    reducedMotion: Boolean = false,
) {
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(corner))
            .background(shimmerBrush(reducedMotion)),
    )
}
