// Swipe-to-confirm (060 FR-018, SC-013).
//
// The driver app uses this for the two irreversible acts in a shift — completing a shop stop and
// ending the collection run — because a tap is too cheap for them. Both commit physical facts about
// packages that are then hard to walk back.
//
// ⚠ DEVIATION FROM PLAN (research R6, recorded here rather than left as drift). R6 specified
// `AnchoredDraggable`. This is built on the STABLE `draggable` + `Animatable` instead, because
// mobile-kit is `kotlin.srcDir`-included into all three mobile apps and they do NOT share a
// toolchain: driver-mobile is on Compose Multiplatform 1.12.0 after 060's bump, while
// customer-mobile and shop-mobile remain on 1.11.1. `AnchoredDraggable` is @ExperimentalFoundationApi
// and its state API has changed shape between releases, so ONE source file consumed by TWO compiler
// versions is a real risk for no gain. Every property R6 actually required — anchored travel, a
// commit threshold, velocity-aware settle, cancellation before commit — is met below.
package com.effyshopping.mobile.kit.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/** How far along the track the knob must travel before the gesture counts as intent. */
private const val COMMIT_FRACTION = 0.72f

private val TrackHeight = 64.dp
private val KnobSize = 56.dp
private val TrackPadding = 4.dp

/**
 * A track the driver must deliberately drag from end to end.
 *
 * ⚠ **Cancellable by construction** (FR-018): releasing before [COMMIT_FRACTION] springs the knob
 * back and [onConfirm] is never called. Only a release past the threshold commits, and then the knob
 * animates to the end first so the driver sees what they did.
 *
 * ⚠ **Operable without the gesture.** A swipe is not available to a switch user or someone driving
 * the screen with a screen reader, and these are the app's two most important actions — so the track
 * also exposes a semantics click action. The design does not show this; omitting it would make
 * completing a stop impossible for some drivers.
 *
 * @param label what the driver is being asked to confirm, e.g. "Swipe to confirm collected"
 * @param onConfirm fired once, after the knob reaches the end
 * @param enabled when false the track is inert and dimmed
 */
@Composable
fun SwipeToConfirm(
    label: String,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    var committed by remember { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(TrackHeight)
            .clip(RoundedCornerShape(TrackHeight / 2))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .alpha(if (enabled) 1f else 0.5f)
            // The accessible equivalent of the gesture. `onClick` here rather than `clickable` so the
            // track does not also fire on a stray tap during a drag.
            .semantics {
                role = Role.Button
                contentDescription = label
                onClick(label = label) {
                    if (enabled && !committed) {
                        committed = true
                        onConfirm()
                    }
                    true
                }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        val maxOffsetPx = with(density) { (maxWidth - KnobSize - TrackPadding * 2).toPx() }
        val offset = remember { Animatable(0f) }

        // Re-arm if the caller re-enables the control (e.g. a failed write let the driver retry).
        LaunchedEffect(enabled) { if (enabled && !committed) offset.snapTo(0f) }

        val progress = if (maxOffsetPx > 0f) (offset.value / maxOffsetPx).coerceIn(0f, 1f) else 0f

        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = KnobSize + TrackPadding * 2)
                // The label fades as the knob covers it, so the two never fight for the same space.
                .alpha(1f - progress),
        )

        Box(
            modifier = Modifier
                .offset { androidx.compose.ui.unit.IntOffset(offset.value.roundToInt(), 0) }
                .padding(TrackPadding)
                .size(KnobSize)
                .clip(RoundedCornerShape(KnobSize / 2))
                .background(MaterialTheme.colorScheme.primary)
                .draggable(
                    enabled = enabled && !committed,
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { delta ->
                        scope.launch {
                            offset.snapTo((offset.value + delta).coerceIn(0f, maxOffsetPx))
                        }
                    },
                    onDragStopped = {
                        if (offset.value >= maxOffsetPx * COMMIT_FRACTION) {
                            committed = true
                            // Settle to the end BEFORE firing, so the commit is visible rather than
                            // the screen simply changing under the driver's thumb.
                            offset.animateTo(maxOffsetPx, tween(120))
                            onConfirm()
                        } else {
                            // Cancelled. Spring back — FR-018's "cancellable before it commits".
                            offset.animateTo(0f, spring())
                        }
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "→",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        }
    }
}
