// The shared screen header (025 FR-030).
//
// Before this, pushed screens in customer-mobile announced themselves with a `TextButton("← Back")`
// floating above the content. It worked, and it read as a prototype: no title, no elevation, no
// standard hit target, and nothing a platform user recognises as "go back".
//
// The back affordance is optional so ONE component serves both a root destination (title only) and a
// pushed screen (title + back), which keeps every screen's header identical by construction rather
// than by everyone remembering to match.
package com.effyshopping.mobile.kit.ui

import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow

/**
 * A screen header.
 *
 * @param title the screen's name. Marked as a heading for assistive technology so a screen reader can
 *   jump straight to it (FR-045).
 * @param onBack when non-null, renders a standard back control. Null on root destinations.
 * @param backIcon the platform back glyph — supplied by the caller because Compose resource
 *   accessors are generated per module and cannot be reached from this shared package.
 * @param backContentDescription spoken label for the back control. Required when [onBack] is set: an
 *   unlabelled icon button is the single most common accessibility defect in a mobile app.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EffyTopBar(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    backIcon: Painter? = null,
    backContentDescription: String = "Back",
    actions: @Composable RowScope.() -> Unit = {},
) {
    TopAppBar(
        // ⚠ FR-031: the bar owns its own safe-area insets. It sits ABOVE EffyPage in every screen, so
        // if it did not consume the top and horizontal insets itself, the title would slide under the
        // status bar and a display cutout would clip the back control — on exactly the devices least
        // likely to be in a developer's hands.
        windowInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal),
        modifier = modifier,
        title = {
            Text(
                title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() },
            )
        },
        navigationIcon = {
            if (onBack != null && backIcon != null) {
                IconButton(onClick = onBack) {
                    Icon(backIcon, contentDescription = backContentDescription)
                }
            }
        },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface,
            navigationIconContentColor = MaterialTheme.colorScheme.onSurface,
            actionIconContentColor = MaterialTheme.colorScheme.onSurface,
        ),
    )
}
