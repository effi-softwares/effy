// Loading skeleton primitives. A skeleton must be composed from the same containers as the content it
// stands in for (a `Row` cannot match a `LazyRow`), so each screen builds its own from these blocks.
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

/** The shimmering fill every block uses; [reducedMotion] makes it a flat tint, still visibly loading. */
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

    // A band sweeping left to right, travelling far enough to leave the block at each end.
    val travel = 900f
    val start = -travel + shift * (travel * 2)
    return Brush.linearGradient(
        colors = listOf(base, highlight, base),
        start = Offset(start, 0f),
        end = Offset(start + travel * 0.6f, 0f),
    )
}

/** A rectangular placeholder: a card, an image, a map strip. */
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
 * @param widthFraction the share of the width this line takes; vary it, or the stack reads as broken.
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

/** A square placeholder: an avatar, an index chip, an icon slot. */
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
