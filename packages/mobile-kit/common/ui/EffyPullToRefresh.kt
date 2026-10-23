// Source-included (`kotlin.srcDir`) into both mobile apps, so keep to Compose APIs both apps' toolchains
// have.
package com.effyshopping.mobile.kit.ui

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
 * Pull to refresh, the one implementation of the gesture. For every caller: the spinner tracks the
 * actual work ([onRefresh] is `suspend` and this owns the flag), a second pull mid-flight is ignored,
 * and a failure changes only the spinner, so "we could not check" never reads as "nothing here". The
 * elastic follow is the `graphicsLayer` line below: `distanceFraction` already carries Material's
 * resistance curve.
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

/** How far the content follows at a full pull: less than the threshold, a hint rather than a slide. */
private val ElasticPullDistance = 56.dp
