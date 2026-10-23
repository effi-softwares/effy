// The shared screen header: a title, plus a back control on pushed screens, so every header matches by construction.
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
 * @param title the screen's name, marked as a heading for assistive technology.
 * @param onBack when non-null, renders a back control. Null on root destinations.
 * @param backIcon the platform back glyph, from the caller (Compose resource accessors are per module).
 * @param backContentDescription the back control's spoken label; required when [onBack] is set.
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
        // The bar consumes its own top and horizontal insets: it sits above EffyPage, so the title would otherwise slide under the status bar.
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
