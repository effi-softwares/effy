package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.mobile.design.EffySpacing

/**
 * The customer app's visual vocabulary — the STOREFRONT identity on a phone (087; first built by 025).
 *
 * Everything a customer screen draws that is shared lives in this package, split by job:
 * foundation (this file), motion, buttons, fields, selection, rows, indicators, states, product
 * tiles, sheets, frame (headers, tab bar, pinned bars) and snackbars. Each component cites its board
 * on the design canvas (`docs/reference-screens/Effy Customer Mobile/`).
 *
 * ⚠ CUSTOMER-LOCAL, NOT `packages/mobile-kit`. The kit there is compiled into the shop and driver apps,
 * which keep the console identity; restyling it would restyle them.
 *
 * ⚠ The storefront rations colour: white ground, black text, zinc greys, Effy blue for EVERY action,
 * Effy green for Sale / savings / "Delivered by Effy" / paid ([com.effyshopping.customer.mobile.core.theme.EffyRoles]).
 * No red — an error is black with an icon. No colour literal belongs in a screen.
 */

/**
 * The phone's sizes (canvas Foundations board). Fat-finger friendly is a requirement (constitution
 * Principle V; 087 FR-021), so the minimums are written once, here.
 */
object EffySize {
    /** The smallest tappable area. */
    val target = 48.dp
    /** A list row with one line. */
    val row = 60.dp
    /** A list row with a second line. */
    val rowWithSubtitle = 64.dp
    /** A text field. */
    val field = 48.dp
    /** The primary action. */
    val primary = 52.dp
    /** A secondary action. */
    val secondary = 48.dp
    /** The tab bar's row, above the home indicator. */
    val tabRow = 58.dp
    /** A tab root's large-title bar. */
    val largeTitleBar = 60.dp
    /** A pushed page's bar. */
    val pushedBar = 52.dp
    /** The screen gutter. */
    val gutter = 16.dp
    /** A delivery tile. */
    val tile = 56.dp
}

/** Minimum touch target. Kept by name: dozens of call sites read it. Same value as [EffySize.target]. */
val EffyMinTouchTarget = EffySize.target

/** The button shape — the storefront's 6dp control radius, never a pill. */
val EffyButtonShape: RoundedCornerShape @Composable get() = EffyStorefrontShape.control

/**
 * ── SURFACE ROLES ───────────────────────────────────────────────────────────────────────────────
 *
 * The storefront is white with zinc wells. A product picture sits on [tint] (zinc-100); a loading
 * placeholder is one step stronger ([skeleton], the hairline grey) so it never reads as content.
 */
object EffySurface {
    /** The page ground — white. */
    val page: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.background

    /** An image well, a band, an aisle circle. */
    val tint: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.surfaceVariant

    /** Loading placeholders. */
    val skeleton: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.outline
}

/** The disabled pair (Material 3 has no disabled slot). */
object EffyDisabled {
    val fill: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.surfaceVariant
    val label: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.onSurfaceVariant
}

/**
 * Display sizes (canvas Foundations board). Geist has a real Bold, so the big steps are 700.
 */
enum class DisplaySize(internal val sp: Int, internal val lineHeightSp: Int, internal val trackingEm: Float, internal val bold: Boolean) {
    /** 44 — the onboarding headline. */
    Hero(44, 46, -0.03f, false),
    /** 34 — a tab root's large title. */
    Page(34, 41, -0.03f, true),
    /** 20 — a section heading. */
    Section(20, 28, -0.01f, false),
    /** 20 — a sheet or empty-state title. */
    Sub(20, 28, -0.01f, false),
}

/** A page or section title in the storefront's display type. */
@Composable
fun EffyDisplay(
    text: String,
    modifier: Modifier = Modifier,
    size: DisplaySize = DisplaySize.Section,
    color: Color = MaterialTheme.colorScheme.onSurface,
    textAlign: TextAlign? = null,
) {
    Text(
        text,
        modifier = modifier,
        color = color,
        textAlign = textAlign,
        style = MaterialTheme.typography.headlineLarge.copy(
            fontSize = size.sp.sp,
            lineHeight = size.lineHeightSp.sp,
            fontWeight = if (size.bold) FontWeight.Bold else FontWeight.SemiBold,
            letterSpacing = size.trackingEm.em,
        ),
    )
}

/**
 * A merchandising section header: title on the left, "See all" in blue on the right (Main board).
 *
 * ⚠ The "See all" target is 48dp tall and carries the section name for a screen reader — three to six
 * of these run down Home, and "See all" alone would be announced identically each time.
 */
@Composable
fun EffySectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    onSeeAll: (() -> Unit)? = null,
    seeAllLabel: String = "See all",
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(start = EffySpacing.lg, end = EffySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        EffyDisplay(title, size = DisplaySize.Section, modifier = Modifier.weight(1f, fill = false))
        if (onSeeAll != null) {
            EffyTextLink(
                seeAllLabel,
                onClick = onSeeAll,
                modifier = Modifier
                    .heightIn(min = EffyMinTouchTarget)
                    .semantics { contentDescription = if (seeAllLabel == "See all") "See all $title" else seeAllLabel },
            )
        }
    }
}

/** The hairline between rows and sections. */
@Composable
fun EffyHairline(modifier: Modifier = Modifier, inset: Boolean = true) {
    HorizontalDivider(
        modifier = if (inset) modifier.padding(horizontal = EffySpacing.lg) else modifier,
        color = MaterialTheme.colorScheme.outlineVariant,
    )
}

// ── The product grid ────────────────────────────────────────────────────────────────────────────

/** Horizontal gutter between tiles. */
val ProductGridGutter = EffySpacing.md

/** Vertical gutter between rows — larger than the horizontal one, so a row reads as a new row. */
val ProductGridRowGap = EffySpacing.xl

/** Page padding around a product grid. */
val ProductGridPadding = PaddingValues(EffySpacing.lg)
