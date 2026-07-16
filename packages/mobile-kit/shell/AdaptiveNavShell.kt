package com.effyshopping.mobile.kit.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.ui.WindowWidth
import com.effyshopping.mobile.kit.ui.widthClassFor

/** A primary-navigation destination for [AdaptiveNavShell]. */
data class NavDestination<T>(
    val tab: T,
    val label: String,
    /** Icon slot; receives whether this destination is currently selected. */
    val icon: @Composable (selected: Boolean) -> Unit,
)

/**
 * Adaptive primary navigation shell (015 FR-001/FR-002/FR-017). Renders the SAME destination set as a
 * **bottom navigation bar on compact** widths and a **navigation rail on expanded** widths, chosen from the
 * Material 3 window size class — never an `isTablet` flag. Built on stable Material 3 (`NavigationBar` /
 * `NavigationRail`), so it compiles and behaves identically on Android and iOS with no alpha navigation
 * dependency. [content] hosts the currently-selected tab's screen (its own per-tab back stack).
 */
@Composable
fun <T> AdaptiveNavShell(
    destinations: List<NavDestination<T>>,
    selectedTab: T,
    onSelectTab: (T) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        when (widthClassFor(maxWidth)) {
            WindowWidth.COMPACT -> Scaffold(
                bottomBar = {
                    NavigationBar {
                        destinations.forEach { d ->
                            NavigationBarItem(
                                selected = d.tab == selectedTab,
                                onClick = { onSelectTab(d.tab) },
                                icon = { d.icon(d.tab == selectedTab) },
                                label = { Text(d.label) },
                            )
                        }
                    }
                },
            ) { padding ->
                Box(modifier = Modifier.fillMaxSize().padding(padding)) { content() }
            }

            WindowWidth.MEDIUM, WindowWidth.EXPANDED -> Row(modifier = Modifier.fillMaxSize()) {
                NavigationRail {
                    destinations.forEach { d ->
                        NavigationRailItem(
                            selected = d.tab == selectedTab,
                            onClick = { onSelectTab(d.tab) },
                            icon = { d.icon(d.tab == selectedTab) },
                            label = { Text(d.label) },
                        )
                    }
                }
                Box(modifier = Modifier.weight(1f).fillMaxSize()) { content() }
            }
        }
    }
}

/**
 * A dependency-free placeholder nav glyph: the destination's initial in the brand tint. A production icon
 * set (Material icons or a custom pack) is a deliberate later polish — the shell takes any composable icon.
 */
@Composable
fun NavGlyph(label: String, selected: Boolean) {
    Text(
        text = label.firstOrNull()?.uppercase() ?: "•",
        style = MaterialTheme.typography.titleMedium,
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(2.dp),
    )
}
