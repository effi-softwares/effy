package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import org.jetbrains.compose.resources.DrawableResource
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.getValue
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.isSpecified
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.unit.sp

/**
 * An empty, error or "no longer yours" state - centred, always saying what happens next (the canvas's
 * Patterns: "Empty - always says what happens next"; "Error - we take the blame, and offer a retry").
 */
@Composable
fun DriverState(
    icon: DrawableResource,
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    actionIcon: DrawableResource? = null,
    /** The action as the primary (blue) button - "Back to Today" on a stop that was moved. */
    primaryAction: Boolean = false,
) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // The redesign's state icon: a 48 dp muted rounded square.
        Box(Modifier.size(48.dp).clip(EffyStorefrontShape.card).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            DriverIcon(icon, size = 22.dp)
        }
        Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), textAlign = TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 320.dp))
        if (actionLabel != null && onAction != null) {
            DriverButton(
                actionLabel, onClick = onAction,
                style = if (primaryAction) DriverButtonStyle.Primary else DriverButtonStyle.Outline,
                icon = actionIcon, tall = false, modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

/**
 * A loading placeholder bar. It shimmers - a lighter band crossing it - because a still grey bar on a grey
 * page reads as UI that finished; with reduced motion it is a still plate. A screen's skeleton is its own
 * containers (the same card, the same row padding) with these where values will be, inside [DriverLoading].
 */
@Composable
fun DriverSkeleton(modifier: Modifier = Modifier, height: Dp = 16.dp) {
    Box(modifier.height(height).clip(EffyStorefrontShape.small).driverShimmer())
}

/** A placeholder line as tall as [style] sets that text, so a skeleton keeps its screen's vertical rhythm. */
@Composable
fun DriverSkeletonText(style: TextStyle, modifier: Modifier = Modifier, widthFraction: Float = 1f) {
    val density = LocalDensity.current
    val line = with(density) { (if (style.lineHeight.isSpecified) style.lineHeight else style.fontSize * 1.3f).toDp() }
    val ink = with(density) { style.fontSize.toDp() } * 0.8f
    Box(modifier.height(line), contentAlignment = Alignment.CenterStart) {
        DriverSkeleton(Modifier.fillMaxWidth(widthFraction), height = ink)
    }
}

/** The region a skeleton is drawn in: announced once as [label], the placeholders hidden from screen readers. */
@Composable
fun DriverLoading(modifier: Modifier = Modifier, label: String = "Loading", content: @Composable () -> Unit) {
    Box(modifier.clearAndSetSemantics { contentDescription = label; liveRegion = LiveRegionMode.Polite }) { content() }
}

private const val SHIMMER_MS = 1100

@Composable
private fun Modifier.driverShimmer(): Modifier {
    val base = MaterialTheme.colorScheme.surfaceVariant
    if (LocalReducedMotion.current) return this.background(base)
    val highlight = MaterialTheme.colorScheme.surface
    val progress by rememberInfiniteTransition(label = "shimmer").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(SHIMMER_MS), RepeatMode.Restart),
        label = "shimmerSweep",
    )
    return this.drawWithCache {
        val start = (progress * 2f - 0.5f) * size.width
        val brush = Brush.linearGradient(listOf(base, highlight, base), Offset(start, 0f), Offset(start + size.width * 0.6f, size.height))
        onDrawBehind {
            drawRect(base)
            drawRect(brush)
        }
    }
}

/** Rows in a [DriverGroup], laid out as `DriverRow` lays them: an optional number circle, a title and its meta line. */
@Composable
private fun SkeletonGroupRows(rows: Int, numbered: Boolean) {
    val type = MaterialTheme.typography
    DriverGroup {
        repeat(rows) { i ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = DriverSize.rowTall).padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (numbered) DriverSkeleton(Modifier.size(32.dp).clip(CircleShape), height = 32.dp)
                Column(Modifier.weight(1f)) {
                    DriverSkeletonText(type.bodyLarge, Modifier.fillMaxWidth(), widthFraction = listOf(0.6f, 0.45f, 0.7f)[i % 3])
                    DriverSkeletonText(type.bodyMedium, Modifier.fillMaxWidth(), widthFraction = 0.35f)
                }
            }
        }
    }
}

/**
 * A run (collection or delivery) before it reads: the from/finish line, the big window, progress, the map's
 * place, then [listLabel] over numbered rows - the shape both run screens draw.
 */
@Composable
fun DriverRunSkeleton(listLabel: String, label: String = "Loading the run") {
    val type = MaterialTheme.typography
    DriverLoading(label = label) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DriverSkeletonText(type.bodyLarge, Modifier.fillMaxWidth(), widthFraction = 0.5f)
                DriverSkeletonText(TextStyle(fontSize = 30.sp, lineHeight = 36.sp), Modifier.fillMaxWidth(), widthFraction = 0.6f)
                DriverSkeleton(Modifier.fillMaxWidth().padding(top = 4.dp), height = 8.dp)
            }
            Box(Modifier.fillMaxWidth().height(210.dp).clip(EffyStorefrontShape.banner)) { DriverSkeleton(Modifier.fillMaxWidth(), height = 210.dp) }
            Column {
                DriverSectionLabel(listLabel)
                SkeletonGroupRows(rows = 4, numbered = true)
            }
        }
    }
}

/** A stop or a drop before it reads: who and where in large type, a line under it, then [listLabel] over its rows. */
@Composable
fun DriverDetailSkeleton(listLabel: String, label: String = "Loading") {
    val type = MaterialTheme.typography
    DriverLoading(label = label) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                DriverSkeletonText(type.bodyLarge, Modifier.fillMaxWidth(), widthFraction = 0.35f)
                DriverSkeletonText(TextStyle(fontSize = 30.sp, lineHeight = 36.sp), Modifier.fillMaxWidth(), widthFraction = 0.75f)
                DriverSkeletonText(type.bodyMedium, Modifier.fillMaxWidth(), widthFraction = 0.55f)
            }
            Column {
                DriverSectionLabel(listLabel)
                SkeletonGroupRows(rows = 3, numbered = false)
            }
        }
    }
}

/** History before it reads: a day's label over its rows, twice. */
@Composable
fun DriverHistorySkeleton() {
    DriverLoading(label = "Loading your history") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(2) {
                Column {
                    DriverSkeleton(Modifier.fillMaxWidth(0.3f).padding(vertical = 8.dp), height = 12.dp)
                    SkeletonGroupRows(rows = 3, numbered = false)
                }
            }
        }
    }
}
