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
 * Window width classes at Material 3's breakpoints, measured from the window, never the device (a
 * tablet in split-screen is [compact]). The shell derives bar or rail itself; this bounds content inside
 * a tab.
 */
enum class WindowWidth { COMPACT, MEDIUM, EXPANDED }

enum class NavigationPresentation { BottomBar, SideRail }

/** Material 3 width breakpoints: compact < 600dp · medium 600–839dp · expanded ≥ 840dp. */
fun widthClassFor(maxWidth: Dp): WindowWidth = when {
    maxWidth < 600.dp -> WindowWidth.COMPACT
    maxWidth < 840.dp -> WindowWidth.MEDIUM
    else -> WindowWidth.EXPANDED
}

fun navigationPresentationFor(usableWidth: Dp): NavigationPresentation =
    if (usableWidth < 600.dp) NavigationPresentation.BottomBar else NavigationPresentation.SideRail

/**
 * A content shell: on a wide window the content is centred and bounded to a reading width; on a compact
 * one it fills the width. A multi-pane layout branches on [widthClassFor] instead.
 *
 * @param maxContentWidth the bound on non-compact windows (forms read best ~560dp; lists wider).
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
