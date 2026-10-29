package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_package
import com.effyshopping.customer.mobile.resources.lucide_wifi_off
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.widthClassFor
import org.jetbrains.compose.resources.DrawableResource

/**
 * A loading placeholder in the shape of what is coming (Patterns board). It shimmers: on a grey page
 * a still grey box is indistinguishable from UI that rendered grey and finished.
 */
@Composable
fun EffySkeletonBlock(modifier: Modifier = Modifier, radius: Dp = EffyStorefrontShape.md) {
    Box(modifier = modifier.clip(RoundedCornerShape(radius)).effyShimmer())
}

/**
 * A line of placeholder text as tall as [style] sets that text — its line box, the bar the height of its
 * letters — so a skeleton built from these has its screen's vertical rhythm by construction. Pass the
 * same style the loaded `Text` uses; vary [widthFraction], or a stack of lines reads as stripes.
 */
@Composable
fun EffySkeletonText(style: TextStyle, modifier: Modifier = Modifier, widthFraction: Float = 1f) {
    val density = LocalDensity.current
    val line = with(density) { (if (style.lineHeight.isSpecified) style.lineHeight else style.fontSize * 1.3f).toDp() }
    val ink = with(density) { style.fontSize.toDp() } * 0.8f
    Box(modifier.height(line), contentAlignment = Alignment.CenterStart) {
        EffySkeletonBlock(Modifier.fillMaxWidth(widthFraction).height(ink), radius = EffyStorefrontShape.sm)
    }
}

/**
 * The region a screen's skeleton is drawn in: announced once as [label], every placeholder inside hidden
 * from TalkBack and VoiceOver. A loading screen is the loaded screen's own containers (`EffyCard`, the same
 * `LazyColumn` padding) with [EffySkeletonText] / [EffySkeletonBlock] where values will be, inside this.
 */
@Composable
fun EffyLoading(modifier: Modifier = Modifier, label: String = "Loading", content: @Composable () -> Unit) {
    Box(modifier.clearAndSetSemantics { contentDescription = label; liveRegion = LiveRegionMode.Polite }) { content() }
}

/** A skeleton in any shape (a circle for an aisle). */
@Composable
fun EffySkeletonShape(shape: Shape, modifier: Modifier = Modifier) {
    Box(modifier = modifier.clip(shape).effyShimmer())
}

/**
 * The shimmer: a lighter band travelling across the placeholder, 1100ms. Under reduced motion the
 * sweep goes and a static plate stays — the space is still reserved and still reads as "not content".
 */
@Composable
fun Modifier.effyShimmer(): Modifier {
    val base = EffySurface.tint
    val highlight = MaterialTheme.colorScheme.background
    if (!effyMotionFull()) return this.background(base)

    val transition = rememberInfiniteTransition(label = "shimmer")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(EffyStorefrontMotion.ShimmerMillis), RepeatMode.Restart),
        label = "shimmerSweep",
    )
    return this.drawWithCache {
        val width = size.width
        val start = (progress * 2f - 0.5f) * width
        val brush = Brush.linearGradient(
            colors = listOf(base, highlight, base),
            start = Offset(start, 0f),
            end = Offset(start + width * 0.6f, size.height),
        )
        onDrawBehind {
            drawRect(base)
            drawRect(brush)
        }
    }
}

/**
 * The empty state: an icon in a zinc circle, a 20sp title, one sentence, and one way forward
 * (Patterns board). Cart, orders, saved items and search all use it.
 */
@Composable
fun EffyEmptyState(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    icon: DrawableResource = Res.drawable.lucide_package,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = EffySpacing.xxxl, vertical = EffySpacing.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        EffyIconChip(icon)
        EffyDisplay(title, size = DisplaySize.Sub, textAlign = TextAlign.Center, modifier = Modifier.padding(top = EffySpacing.lg))
        Text(
            body,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = EffySpacing.s),
        )
        if (actionLabel != null && onAction != null) {
            EffyPrimaryButton(actionLabel, onClick = onAction, modifier = Modifier.padding(top = EffySpacing.xl))
        }
    }
}

/**
 * The error state (Patterns board): black, with an icon — never red — and always a way to try again.
 * A failure with no retry leaves the shopper to guess whether waiting or leaving is the fix.
 */
@Composable
fun EffyErrorState(
    title: String,
    body: String = "Check your connection and try again.",
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    icon: DrawableResource = Res.drawable.lucide_wifi_off,
) {
    EffyEmptyState(title, body, modifier = modifier, icon = icon, actionLabel = "Try again", onAction = onRetry)
}

/**
 * Cross-fades between loading, content and error, so a page never hard-cuts from skeleton to data
 * (Motion board). [key] picks the state; [content] draws it.
 */
@Composable
fun <S> EffyLoadingSwap(
    state: S,
    modifier: Modifier = Modifier,
    key: (S) -> Any? = { it?.let { s -> s::class } },
    content: @Composable (S) -> Unit,
) {
    val duration = effyDuration(EffyStorefrontMotion.StandardMillis)
    AnimatedContent(
        targetState = state,
        modifier = modifier,
        contentKey = key,
        transitionSpec = { fadeIn(tween(duration)) togetherWith fadeOut(tween(duration)) },
        label = "loadingSwap",
    ) { s -> content(s) }
}

/** Home's loading state — the aisle row and three rails, at the real tile width. */
@Composable
fun EffyHomeSkeleton(modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        val tileWidth = maxWidth * railTileWidthFraction(widthClassFor(maxWidth))
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(HomeSectionGap)) {
            LazyRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                contentPadding = PaddingValues(horizontal = EffySpacing.md),
                userScrollEnabled = false,
            ) {
                items(6) {
                    Column(modifier = Modifier.width(72.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        EffySkeletonShape(CircleShape, Modifier.size(60.dp))
                        EffySkeletonBlock(Modifier.padding(top = EffySpacing.s).width(44.dp).height(11.dp), radius = EffyStorefrontShape.sm)
                    }
                }
            }
            repeat(3) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        EffySkeletonBlock(Modifier.width(132.dp).height(22.dp), radius = EffyStorefrontShape.sm)
                        EffySkeletonBlock(Modifier.width(56.dp).height(16.dp), radius = EffyStorefrontShape.sm)
                    }
                    LazyRow(
                        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
                        horizontalArrangement = Arrangement.spacedBy(RailItemGap),
                        contentPadding = PaddingValues(horizontal = EffySpacing.lg),
                        userScrollEnabled = false,
                    ) {
                        items(4) { EffyProductCardSkeleton(Modifier.width(tileWidth)) }
                    }
                }
            }
        }
    }
}

/** A product-tile-shaped skeleton. */
@Composable
fun EffyProductCardSkeleton(modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        EffySkeletonBlock(Modifier.fillMaxWidth().aspectRatio(1f), radius = EffyStorefrontShape.lg)
        EffySkeletonBlock(Modifier.padding(top = EffySpacing.md).fillMaxWidth(0.5f).height(12.dp), radius = EffyStorefrontShape.sm)
        EffySkeletonBlock(Modifier.padding(top = EffySpacing.s).fillMaxWidth(0.85f).height(16.dp), radius = EffyStorefrontShape.sm)
        EffySkeletonBlock(Modifier.padding(top = EffySpacing.s).width(64.dp).height(18.dp), radius = EffyStorefrontShape.sm)
    }
}
