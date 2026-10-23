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
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffoldLayout
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffoldValue
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteType
import androidx.compose.material3.adaptive.navigationsuite.rememberNavigationSuiteScaffoldState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.ui.LocalMotionLevel
import com.effyshopping.mobile.kit.ui.MotionLevel
import com.effyshopping.mobile.kit.ui.NavigationPresentation
import com.effyshopping.mobile.kit.ui.navigationPresentationFor

data class ResponsiveDestination<T>(
    val tab: T,
    val label: String,
    val icon: @Composable (selected: Boolean) -> Unit,
)

/**
 * The adaptive navigation shell: a bottom bar on a compact window, a side rail on a wide one, animated
 * away on destinations that ask. Built on `NavigationSuiteScaffoldLayout` (the library's documented
 * escape hatch): the bar's look is ours ([NavigationButton]: an underline and a heavier label, which
 * `NavigationBarItem`'s pill cannot express), but the layout and its animation are the library's, which
 * animates the component's layout contribution continuously so content never jumps. Below
 * [MotionLevel.Full] it snaps.
 */
@Composable
fun <T> ResponsiveNavigation(
    destinations: List<ResponsiveDestination<T>>,
    selectedTab: T,
    onSelectTab: (T) -> Unit,
    modifier: Modifier = Modifier,
    railHeader: (@Composable () -> Unit)? = null,
    railFooter: (@Composable () -> Unit)? = null,
    /**
     * Whether the bar or rail is shown. Callers pass `false` below a tab's root, where a screen owns a
     * bottom-anchored action or is a focused flow: two stacked bottom bars is broken on every platform.
     */
    showNavigation: Boolean = true,
    /** A caller-drawn bottom bar for the compact presentation (the customer app's tab bar); the rail is still drawn from [destinations]. */
    bottomBar: (@Composable () -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val state = rememberNavigationSuiteScaffoldState()
    val target =
        if (showNavigation) NavigationSuiteScaffoldValue.Visible else NavigationSuiteScaffoldValue.Hidden
    val animate = LocalMotionLevel.current == MotionLevel.Full

    LaunchedEffect(target, animate) {
        // Guarded so a recomposition that changes nothing does not restart the spring.
        if (state.targetValue == target) return@LaunchedEffect
        when {
            !animate -> state.snapTo(target)
            target == NavigationSuiteScaffoldValue.Visible -> state.show()
            else -> state.hide()
        }
    }

    // The bar/rail breakpoint is ours (`navigationPresentationFor`, 600dp, unit-tested), via
    // `BoxWithConstraints` to avoid an experimental opt-in.
    //
    // `clipToBounds` is load-bearing: the layout parks the hidden component just past its edge, and
    // here (inside the safe area) that edge is not the screen's, so without clipping part of the bar
    // shows in the gesture-inset strip.
    BoxWithConstraints(modifier.fillMaxSize().clipToBounds()) {
        val presentation = navigationPresentationFor(maxWidth)
        NavigationSuiteScaffoldLayout(
            navigationSuite = {
                when (presentation) {
                    NavigationPresentation.BottomBar ->
                        if (bottomBar != null) bottomBar() else BottomBar(destinations, selectedTab, onSelectTab)

                    NavigationPresentation.SideRail ->
                        SideRail(destinations, selectedTab, onSelectTab, railHeader, railFooter)
                }
            },
            navigationSuiteType = when (presentation) {
                NavigationPresentation.BottomBar -> NavigationSuiteType.NavigationBar
                NavigationPresentation.SideRail -> NavigationSuiteType.NavigationRail
            },
            state = state,
        ) {
            // One content container for both forms.
            Box(
                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
                content = content,
            )
        }
    }
}

@Composable
private fun <T> BottomBar(
    destinations: List<ResponsiveDestination<T>>,
    selectedTab: T,
    onSelectTab: (T) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            // `background`, not `surface` (they differ in dark): the bar is part of the page. Set on the
            // column so it also paints behind the gesture-inset strip.
            .background(MaterialTheme.colorScheme.background),
    ) {
        // The hairline between the bar and the page, which share one background. The `border` token
        // (`outlineVariant`), drawn above the horizontal insets so it runs edge to edge.
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(
                    WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom),
                )
                .heightIn(min = 72.dp)
                // As Material 3's `NavigationBar` does, so a screen reader announces each tab's position.
                .selectableGroup(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            destinations.forEach { destination ->
                NavigationButton(
                    label = destination.label,
                    selected = destination.tab == selectedTab,
                    onClick = { onSelectTab(destination.tab) },
                    icon = { destination.icon(destination.tab == selectedTab) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun <T> SideRail(
    destinations: List<ResponsiveDestination<T>>,
    selectedTab: T,
    onSelectTab: (T) -> Unit,
    railHeader: (@Composable () -> Unit)?,
    railFooter: (@Composable () -> Unit)?,
) {
    Row {
        Column(
            modifier = Modifier
                .width(88.dp)
                .fillMaxHeight()
                // `background`, matching the bottom bar.
                .background(MaterialTheme.colorScheme.background)
                .windowInsetsPadding(
                    WindowInsets.safeDrawing.only(
                        WindowInsetsSides.Start + WindowInsetsSides.Top + WindowInsetsSides.Bottom,
                    ),
                )
                .padding(start = 10.dp, top = 18.dp)
                .selectableGroup(),
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
        // The divider belongs to the rail, so it travels with it when the rail animates away.
        Box(
            Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.outlineVariant),
        )
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
        // The selected tab is not told by colour alone: a filled icon (the caller's `icon(selected)`),
        // a heavier label and an underline. The M3 item's pill indicator cannot do the underline.
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
                // The second non-colour signal: the selected label is SemiBold.
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
