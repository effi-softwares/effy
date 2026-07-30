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
 * The adaptive navigation shell — bottom bar on a compact window, side rail on a wide one, and the
 * navigation component animated away entirely on destinations that ask for it.
 *
 * ── ⚠ THE LAYOUT AND THE ANIMATION ARE THE LIBRARY'S, NOT OURS ──────────────────────────────────
 *
 * This is built on **`NavigationSuiteScaffoldLayout`** from `material3-adaptive-navigation-suite`,
 * which the library documents as the intended escape hatch: *"The usage of this function is
 * recommended when you need some customization that is not viable via the use of
 * `NavigationSuiteScaffold`."* That is exactly our position — the bar's LOOK is ours (72dp, an
 * underline indicator, a weight-stepped label; see [NavigationButton]) because FR-040 needs three
 * non-colour signals and `NavigationBarItem`'s pill indicator cannot express them — but the LAYOUT
 * has no business being ours.
 *
 * What this replaced, and why it had to go:
 *
 *   - a `Column` whose content had `weight(1f)` above an `AnimatedVisibility(slideIn/slideOut)` bar.
 *     ⚠ **`slideIn`/`slideOut` do not affect the size of an `AnimatedVisibility`** — the library says
 *     so in as many words — so the bar kept its full footprint for the whole exit and then left the
 *     layout in ONE FRAME. Content jumped ~48dp *after* the animation finished. A comment above that
 *     code asserted the opposite; the comment was wrong, not the observation.
 *   - a `Row` whose rail was a bare `if`, so on a tablet the rail and its divider vanished instantly
 *     and content jumped 88dp sideways with no animation at all.
 *
 * `NavigationSuiteScaffoldLayout` measures content as
 * `layoutHeight - (navigationHeight * animationProgress)` and places the navigation at
 * `layoutHeight - (navigationHeight * animationProgress)` — so the component's **layout contribution**
 * is animated continuously, for the rail as well as the bar. There is no frame where anything jumps.
 *
 * ⚠ The animation's timing is therefore the LIBRARY's spring, not `EffyMotion`. Reduced motion is
 * still honoured, and more strictly than before: anything below [MotionLevel.Full] uses `snapTo`, so
 * the component appears and disappears with no travel at all (025 FR-037).
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
     * Whether the bar/rail is shown at all (026).
     *
     * ⚠ Defaults to `true`, so shop-mobile — which this feature does not restyle — is unaffected.
     *
     * The customer app passes `false` below a tab's root: those destinations own a bottom-anchored
     * primary action (product detail's sticky "Add to Cart", cart, checkout) or are focused
     * full-screen flows (auth). Two stacked bottom bars is the one thing Material 3, the iOS HIG,
     * classic iOS practice and iOS 26 all agree is broken; they disagree about everything else, which
     * is why this stays a per-destination decision the CALLER makes rather than a rule baked in here.
     */
    showNavigation: Boolean = true,
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

    // The bar↔rail breakpoint stays OURS: `navigationPresentationFor` is 600dp, unit-tested, and
    // identical to the Material 3 default the library would apply. Using `BoxWithConstraints` rather
    // than `currentWindowAdaptiveInfo()` keeps that decision free of an experimental opt-in.
    //
    // ⚠ `clipToBounds()` IS LOAD-BEARING — do not remove it as redundant.
    //
    // `NavigationSuiteScaffoldLayout` parks the hidden component just past its own edge: at
    // `layoutHeight` for the bar, at `-width` for the rail. That is exactly off-screen ONLY when the
    // scaffold fills the window, which is how Google uses it. It does not fill the window here — the
    // app root consumes `safeDrawing` ABOVE this shell, so the layout ends at the safe-area boundary
    // and "just past the edge" still leaves the component inside the gesture-inset strip. Measured:
    // 14px of the first tab's icon visible at the very bottom of the screen.
    //
    // A `Layout` does not clip its children, so nothing else would stop it. The previous
    // `AnimatedVisibility` implementation hid this by removing the bar from composition outright —
    // which is also why it snapped.
    BoxWithConstraints(modifier.fillMaxSize().clipToBounds()) {
        val presentation = navigationPresentationFor(maxWidth)
        NavigationSuiteScaffoldLayout(
            navigationSuite = {
                when (presentation) {
                    NavigationPresentation.BottomBar ->
                        BottomBar(destinations, selectedTab, onSelectTab)

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
            // ONE content container for both forms. It used to be two — the rail branch painted
            // `background` and the bar branch painted nothing, which only looked the same because
            // both resolve to `background` today.
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            // ⚠ `background`, NOT `surface`.
            //
            // In LIGHT the two tokens are the same value, so this looked correct for as long as
            // anyone only checked light mode. In DARK they diverge — `surface` is #333333 and
            // `background` is #1A1A1A — so the whole navigation strip rendered as a distinctly
            // lighter band across the bottom of every screen. The bar is part of the page, not a
            // raised sheet on it; the source design draws it that way too.
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(
                WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom),
            )
            .heightIn(min = 72.dp)
            // Material 3's own `NavigationBar` does this and our hand-rolled Row did not: without it
            // a screen reader announces each tab in isolation, with no "2 of 4" position.
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
                // `background`, matching the bottom bar — see the note there.
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
        // ⚠ 026 / FR-040 — MEANING MUST NOT REST ON COLOUR ALONE, and under the monochrome palette
        // it was: `primary` vs `onSurfaceVariant` is now a near-black/grey LIGHTNESS difference, not
        // a hue one, so the selected tab was distinguished only by being slightly darker.
        //
        // The source design language solves this with THREE simultaneous signals — a filled icon
        // (the caller already swaps that via `icon(selected)`), a heavier label, and an underline
        // bar. The latter two are added here. This changes shop-mobile too, deliberately: it is an
        // accessibility correction that applies to every audience, not a customer restyle.
        //
        // ⚠ This is also why the shell does NOT use `NavigationBar`/`NavigationBarItem` and drops to
        // `NavigationSuiteScaffoldLayout` instead: the M3 item draws a pill indicator behind the icon
        // and offers no way to replace it with an underline.
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
