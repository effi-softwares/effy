package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_arrow_right
import com.effyshopping.driver.mobile.resources.lucide_check
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private const val COMMIT_FRACTION = 0.72f
private val Track = 64.dp
private val Thumb = 56.dp
private val Inset = 4.dp

/**
 * Swipe to confirm (canvas `SwipeConfirm`) — for the acts that commit physical facts about packages
 * (collect a stop, check in at the hub). A blue track and thumb; on commit the thumb settles at the end
 * and turns green with a tick.
 *
 * Cancellable: a release before 72% springs back and nothing happens. Operable without the gesture:
 * the track carries a click action for switch and screen-reader users.
 *
 * @param note a line above the track ("4 of 4 packages ticked"); null for none.
 */
@Composable
fun DriverSwipeToConfirm(
    label: String,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    note: String? = null,
) {
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    var committed by remember { mutableStateOf(false) }
    val scheme = MaterialTheme.colorScheme
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (note != null) {
            Text(note, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(Track)
                .clip(EffyStorefrontShape.card)
                .background(if (!enabled) scheme.surfaceVariant else if (committed) EffyRoles.brandMuted else EffyRoles.primaryMuted)
                .semantics {
                    role = Role.Button
                    contentDescription = "$label. Swipe right to confirm."
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
            val maxPx = with(density) { (maxWidth - Thumb - Inset * 2).toPx() }
            val offset = remember { Animatable(0f) }
            LaunchedEffect(enabled) { if (enabled && !committed) offset.snapTo(0f) }
            val progress = if (maxPx > 0f) (offset.value / maxPx).coerceIn(0f, 1f) else 0f
            val ink = if (!enabled) scheme.onSurfaceVariant else if (committed) EffyRoles.brand else scheme.primary
            Text(
                label,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = ink,
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = Modifier.fillMaxWidth().padding(start = Thumb + Inset * 2, end = 16.dp).alpha(1f - progress * 0.8f),
            )
            Box(
                Modifier
                    .offset { IntOffset(offset.value.roundToInt(), 0) }
                    .padding(Inset)
                    .size(Thumb)
                    .clip(EffyStorefrontShape.control)
                    .background(if (!enabled) scheme.outline else if (committed) EffyRoles.brandFill else scheme.primary)
                    .draggable(
                        enabled = enabled && !committed,
                        orientation = Orientation.Horizontal,
                        state = rememberDraggableState { delta -> scope.launch { offset.snapTo((offset.value + delta).coerceIn(0f, maxPx)) } },
                        onDragStopped = {
                            if (offset.value >= maxPx * COMMIT_FRACTION) {
                                committed = true
                                offset.animateTo(maxPx, tween(120))
                                onConfirm()
                            } else {
                                offset.animateTo(0f, spring())
                            }
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                DriverIcon(
                    if (committed) Res.drawable.lucide_check else Res.drawable.lucide_arrow_right,
                    size = 22.dp,
                    tint = if (committed) EffyRoles.brandForeground else scheme.onPrimary,
                )
            }
        }
    }
}
