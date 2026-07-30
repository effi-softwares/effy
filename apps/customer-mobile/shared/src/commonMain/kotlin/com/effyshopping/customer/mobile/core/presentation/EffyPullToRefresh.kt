package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * Pull to refresh — the app's ONE implementation of the gesture.
 *
 * ── Why this is shared rather than repeated ─────────────────────────────────────────────────────
 *
 * Six screens want it. Six copies would drift: one would forget to guard a second pull mid-flight,
 * another would leave the spinner running after a failure, and the elastic follow would exist on some
 * and not others. Here it is decided once.
 *
 * ── The three rules it enforces for every caller ────────────────────────────────────────────────
 *
 *  1. **The spinner tracks the actual work.** [onRefresh] is a `suspend` function and this composable owns
 *     the flag around it, so the indicator cannot lie about whether anything is still happening.
 *  2. **A second pull mid-flight is ignored**, not queued. It is the same request, not a new one.
 *  3. **A failure changes nothing but the spinner.** Callers are expected to keep their content on a failed
 *     refresh — "we could not check" must never read to a shopper as "there is nothing here".
 *
 * ⚠ The elastic follow is the `graphicsLayer` line below, and it is the whole of it. `distanceFraction`
 * already carries Material's own resistance curve — the further you pull the less it gives — so the
 * content follows the finger and rubber-bands back on release without any animation code, spring spec or
 * gesture handling of our own. One line, in one file, for every screen.
 *
 * @param onRefresh the work to do. Keep the caller's content on failure; do not clear it.
 */
@Composable
fun EffyPullToRefresh(
    onRefresh: suspend () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val state = rememberPullToRefreshState()
    var isRefreshing by remember { mutableStateOf(false) }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = {
            if (!isRefreshing) {
                isRefreshing = true
                scope.launch {
                    try {
                        onRefresh()
                    } finally {
                        isRefreshing = false
                    }
                }
            }
        },
        state = state,
        modifier = modifier,
    ) {
        Box(
            Modifier.graphicsLayer { translationY = state.distanceFraction * ElasticPullDistance.toPx() },
        ) {
            content()
        }
    }
}

/**
 * How far the content follows the finger at a full pull. Deliberately smaller than the gesture's own
 * threshold: the content should hint that it is being dragged, not slide out from under the shopper.
 */
private val ElasticPullDistance = 56.dp
