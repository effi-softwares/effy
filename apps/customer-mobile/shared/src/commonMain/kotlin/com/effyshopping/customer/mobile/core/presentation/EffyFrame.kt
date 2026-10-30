package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.nav.LocalNavBack
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_bell
import com.effyshopping.customer.mobile.resources.lucide_chevron_left
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.painterResource

/**
 * The app's frame: no dark ribbon above the header (the status-bar area is the page's white), no border
 * under any header, and a header holds only the title or wordmark, Back and the notifications bell (the
 * cart is in the tab bar; there is no `trailing` slot).
 */

/** Opens Notifications from any header. Provided once by the shell, so screens never wire it. */
val LocalOpenNotifications = androidx.compose.runtime.compositionLocalOf<(() -> Unit)?> { null }

/** Is this an iOS build? Provided by the shell (iOS says "‹ Back"; Android shows the arrow only). */
val LocalIsIos = androidx.compose.runtime.staticCompositionLocalOf { false }

/**
 * Drives the large title's collapse from the page's scroll - connect [connection] with
 * `Modifier.nestedScroll(...)` on the scrolling content. 0 = expanded, 1 = collapsed, over 52dp.
 */
@Stable
class EffyCollapseState internal constructor(private val rangePx: Float) {
    private var offsetPx by mutableFloatStateOf(0f)

    /** 0 expanded … 1 collapsed. */
    val fraction: Float get() = if (rangePx <= 0f) 0f else (-offsetPx / rangePx).coerceIn(0f, 1f)

    val connection: NestedScrollConnection = object : NestedScrollConnection {
        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
            offsetPx = (offsetPx + consumed.y).coerceIn(-rangePx, 0f)
            // Pulled past the top: the page is at its start, so the title is fully large again.
            if (available.y > 0f) offsetPx = 0f
            return Offset.Zero
        }
    }
}

/** A collapse state for one page. */
@Composable
fun rememberEffyCollapse(): EffyCollapseState {
    val range = with(LocalDensity.current) { 52.dp.toPx() }
    return remember(range) { EffyCollapseState(range) }
}

/**
 * A tab root's header - the large bold title (or the "effy." wordmark on Home) on the left, the bell
 * on the right, and an optional search field below (App bar board, back=false). As the page scrolls it
 * collapses into a compact centred 17sp title, the way an iOS large title does; the search field stays.
 */
@Composable
fun EffyLargeTitleBar(
    title: String,
    modifier: Modifier = Modifier,
    wordmark: Boolean = false,
    collapse: EffyCollapseState? = null,
    showBell: Boolean = true,
    search: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val f = collapse?.fraction ?: 0f
    val onBell = LocalOpenNotifications.current
    Column(modifier = modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(lerp(EffySize.largeTitleBar, EffySize.pushedBar, f))
                .padding(start = EffySpacing.lg, end = EffySpacing.s),
        ) {
            // The large title (fades and shrinks away as the page scrolls).
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(end = 56.dp)
                    .graphicsLayer {
                        alpha = 1f - f
                        val s = 1f - 0.25f * f
                        scaleX = s; scaleY = s
                        transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0.5f)
                    },
            ) {
                if (wordmark) EffyWordmark(size = 34.sp)
                else Text(
                    title,
                    style = MaterialTheme.typography.displayMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.semantics { heading() },
                )
            }
            // The compact title (appears as the large one goes).
            if (f > 0.01f) {
                Text(
                    if (wordmark) "Effy" else title,
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    modifier = Modifier.align(Alignment.Center).graphicsLayer { alpha = f },
                )
            }
            if (showBell && onBell != null) {
                EffyIconButton(
                    Res.drawable.lucide_bell,
                    contentDescription = "Notifications",
                    onClick = onBell,
                    iconSize = 26.dp,
                    modifier = Modifier.align(Alignment.CenterEnd),
                )
            }
        }
        if (search != null) {
            Column(modifier = Modifier.padding(start = EffySpacing.lg, end = EffySpacing.lg, top = EffySpacing.md, bottom = EffySpacing.xs)) { search() }
        }
    }
}

/**
 * A pushed page's header - "‹ Back" in blue on the left (the arrow alone on Android), the title centred
 * in 17sp, the bell optional on the right (App bar board, back=true). No border.
 *
 * [onBack] defaults to the navigator ([LocalNavBack]): present on a pushed page, absent at a tab root.
 */
@Composable
fun EffyAppBar(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = LocalNavBack.current,
    showBell: Boolean = false,
) {
    val onBell = LocalOpenNotifications.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = EffySize.pushedBar)
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = EffySpacing.xs),
    ) {
        Box(modifier = Modifier.align(Alignment.CenterStart)) { EffyBackArrow(onBack = onBack) }
        Text(
            title,
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 96.dp).semantics { heading() },
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (showBell && onBell != null) {
            EffyIconButton(Res.drawable.lucide_bell, contentDescription = "Notifications", onClick = onBell, modifier = Modifier.align(Alignment.CenterEnd))
        }
    }
}

/**
 * Back on its own - "‹ Back" in blue on iOS, the chevron alone on Android - in a 48dp target. The box
 * keeps its width even when there is nothing to go back to, so a centred title never shifts.
 */
@Composable
fun EffyBackArrow(
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = LocalNavBack.current,
) {
    val ios = LocalIsIos.current
    val interactions = remember { MutableInteractionSource() }
    Box(modifier = modifier.heightIn(min = EffySize.target).widthIn(min = EffySize.target), contentAlignment = Alignment.CenterStart) {
        if (onBack != null) {
            Row(
                modifier = Modifier
                    .heightIn(min = EffySize.target)
                    .effyPress(interactions, 0.95f)
                    .clip(MaterialTheme.shapes.small)
                    .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = "Back", onClick = onBack)
                    .padding(end = if (ios) EffySpacing.s else 0.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    painterResource(Res.drawable.lucide_chevron_left),
                    contentDescription = "Back",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(if (ios) 30.dp else 26.dp).padding(start = if (ios) 0.dp else 4.dp),
                )
                if (ios) {
                    Text("Back", style = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp), color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

/**
 * The pinned action bar: the primary action stays on screen while the page scrolls. A floating layer (top
 * hairline, soft shadow, white, 16dp gutter) that slides up on first appearance (instant under reduced
 * motion). The app root applies the bottom safe area.
 */
@Composable
fun EffyPinnedBar(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    var shown by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(Unit) { shown = true }
    val full = effyMotionFull()
    AnimatedVisibility(
        visible = shown || !full,
        enter = slideInVertically(tween(EffyStorefrontMotion.StandardMillis)) { it } + fadeIn(tween(EffyStorefrontMotion.StandardMillis)),
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(8.dp, ambientColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.06f), spotColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.06f))
                .background(MaterialTheme.colorScheme.background),
        ) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = EffySize.gutter, vertical = EffySpacing.md),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
                content = content,
            )
        }
    }
}

/**
 * The wordmark - "effy" in Geist Bold with its full stop in Effy green (the web's `BrandMark`). Type,
 * not an image, so it scales with the text around it.
 */
@Composable
fun EffyWordmark(modifier: Modifier = Modifier, size: TextUnit = 26.sp) {
    Text(
        buildAnnotatedString {
            append("effy")
            withStyle(SpanStyle(color = EffyRoles.brand)) { append(".") }
        },
        modifier = modifier.semantics { heading() },
        style = MaterialTheme.typography.displayMedium.copy(fontSize = size, lineHeight = size * 1.15f, fontWeight = FontWeight.Bold, letterSpacing = (-0.05).em),
        color = MaterialTheme.colorScheme.onSurface,
    )
}

/** A spacer the width of a 48dp target, for symmetric rows. */
@Composable
fun EffyTargetSpacer() {
    Box(Modifier.width(EffySize.target))
}

/**
 * The right header for a screen that can be both a tab root and a pushed page (Search / Results,
 * Orders from Account): the large title at a root, "‹ Back" + centred title when pushed. Decided by
 * the navigator ([LocalNavBack]), never by the screen.
 */
@Composable
fun EffyScreenHeader(
    title: String,
    modifier: Modifier = Modifier,
    collapse: EffyCollapseState? = null,
    search: (@Composable ColumnScope.() -> Unit)? = null,
) {
    if (LocalNavBack.current == null) {
        EffyLargeTitleBar(title, modifier = modifier, collapse = collapse, search = search)
    } else {
        Column(modifier = modifier) {
            EffyAppBar(title)
            if (search != null) {
                Column(modifier = Modifier.padding(start = EffySpacing.lg, end = EffySpacing.lg, top = EffySpacing.md, bottom = EffySpacing.xs)) { search() }
            }
        }
    }
}
