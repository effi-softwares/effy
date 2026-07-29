package com.effyshopping.mobile.kit.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.ui.NavigationPresentation
import com.effyshopping.mobile.kit.ui.navigationPresentationFor

data class ResponsiveDestination<T>(
    val tab: T,
    val label: String,
    val icon: @Composable (selected: Boolean) -> Unit,
)

@Composable
fun <T> ResponsiveNavigation(
    destinations: List<ResponsiveDestination<T>>,
    selectedTab: T,
    onSelectTab: (T) -> Unit,
    modifier: Modifier = Modifier,
    railHeader: (@Composable () -> Unit)? = null,
    railFooter: (@Composable () -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    BoxWithConstraints(modifier.fillMaxSize()) {
        when (navigationPresentationFor(maxWidth)) {
            NavigationPresentation.BottomBar -> Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f).fillMaxWidth(), content = content)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface)
                        .windowInsetsPadding(
                            WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom),
                        )
                        .heightIn(min = 72.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    destinations.forEach { destination ->
                        NavigationButton(
                            label = destination.label,
                            selected = destination.tab == selectedTab,
                            onClick = { onSelectTab(destination.tab) },
                            icon = { destination.icon(destination.tab == selectedTab) },
                            modifier = Modifier
                                .weight(1f),
                        )
                    }
                }
            }

            NavigationPresentation.SideRail -> Row(Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .width(88.dp)
                        .fillMaxHeight()
                        .background(MaterialTheme.colorScheme.surface)
                        .windowInsetsPadding(
                            WindowInsets.safeDrawing.only(
                                WindowInsetsSides.Start + WindowInsetsSides.Top + WindowInsetsSides.Bottom,
                            ),
                        )
                        .padding(start = 10.dp, top = 18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    railHeader?.invoke()
                    Spacer(Modifier.size(10.dp))
                    destinations.forEach { destination ->
                        NavigationButton(
                            label = destination.label,
                            selected = destination.tab == selectedTab,
                            onClick = { onSelectTab(destination.tab) },
                            icon = { destination.icon(destination.tab == selectedTab) },
                            modifier = Modifier.fillMaxWidth(),
                            edgeIndicator = true,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    railFooter?.invoke()
                }
                Box(
                    Modifier
                        .width(1.dp)
                        .fillMaxHeight()
                        .background(MaterialTheme.colorScheme.outlineVariant),
                )
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(MaterialTheme.colorScheme.background),
                    content = content,
                )
            }
        }
    }
}

@Composable
private fun NavigationButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    edgeIndicator: Boolean = false,
) {
    val color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        modifier = modifier
            .heightIn(min = 64.dp)
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) {
                role = Role.Tab
                this.selected = selected
                contentDescription = label
            },
    ) {
        // ⚠ 026 / FR-040 — MEANING MUST NOT REST ON COLOUR ALONE, and under the monochrome palette
        // it was: `primary` vs `onSurfaceVariant` is now a near-black/grey LIGHTNESS difference, not
        // a hue one, so the selected tab was distinguished only by being slightly darker.
        //
        // The source design language solves this with THREE simultaneous signals — a filled icon
        // (the caller already swaps that via `icon(selected)`), a heavier label, and an underline
        // bar. The latter two are added here. This changes shop-mobile too, deliberately: it is an
        // accessibility correction that applies to every audience, not a customer restyle.
        if (!edgeIndicator && selected) {
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 12.dp)
                    .fillMaxWidth()
                    .height(3.dp)
                    .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
        if (edgeIndicator && selected) {
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .width(4.dp)
                    .height(40.dp)
                    .clip(RoundedCornerShape(topStart = 4.dp, bottomStart = 4.dp))
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 6.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            CompositionLocalProvider(LocalContentColor provides color) { icon() }
            Text(
                label,
                // The second non-colour signal: the selected label steps up a weight. SemiBold is the
                // heaviest face the platform typeface ships — asking for Bold would synthesise.
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                ),
                color = color,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
        }
    }
}
