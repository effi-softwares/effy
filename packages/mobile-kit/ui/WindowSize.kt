package com.effyshopping.mobile.kit.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Window width classes. Material 3's breakpoints, measured from the WINDOW — never the device type. A tablet
 * in split-screen is [COMPACT]; a large foldable is [EXPANDED]. Layout branches on this, never on an
 * `isTablet` boolean or a platform check.
 *
 * Shared mobile-kit (015): promoted from shop-mobile's app-local `core/ui/WindowSize.kt` so BOTH mobile apps
 * get the adaptive layer (the customer app had none). The `NavigationSuiteScaffold` shell derives the
 * bar↔rail form from the same window size class; this enum is retained for content bounding INSIDE a tab.
 */
enum class WindowWidth { COMPACT, MEDIUM, EXPANDED }

/** Material 3 width breakpoints: compact < 600dp · medium 600–839dp · expanded ≥ 840dp. */
fun widthClassFor(maxWidth: Dp): WindowWidth = when {
    maxWidth < 600.dp -> WindowWidth.COMPACT
    maxWidth < 840.dp -> WindowWidth.MEDIUM
    else -> WindowWidth.EXPANDED
}

/**
 * Tablet-first content shell. On a **tablet / large window** the content is centered and bounded to a
 * comfortable reading width instead of stretched edge-to-edge; on a **compact** window it fills the width
 * (the phone reflow). The primary shop target is a tablet in landscape, so this is the DEFAULT wrapper for a
 * single-column screen — a multi-pane layout branches on [widthClassFor] to two panes.
 *
 * @param maxContentWidth the bound applied on non-compact windows (forms read best ~560dp; lists wider).
 */
@Composable
fun AdaptiveContent(
    modifier: Modifier = Modifier,
    maxContentWidth: Dp = 560.dp,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable ColumnScope.(WindowWidth) -> Unit,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val width = widthClassFor(maxWidth)
        val columnModifier = if (width == WindowWidth.COMPACT) {
            Modifier.fillMaxWidth()
        } else {
            Modifier.widthIn(max = maxContentWidth).fillMaxWidth()
        }
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(modifier = columnModifier, verticalArrangement = verticalArrangement) {
                content(width)
            }
        }
    }
}
