package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

/**
 * The receipt's bounded status palette — 052 FR-015, a RECORDED EXCEPTION to Principle V.
 *
 * ── Read this before adding anything here ───────────────────────────────────────────────────────
 *
 * The constitution permits exactly TWO semantic colours (destructive #e01010 and success #0c9409) and
 * forbids a third as a UI colour. The same-day amber below IS a third. It is recorded in
 * specs/052-order-confirmation-invoice/plan.md § Complexity Tracking and bounded by six rules that
 * SC-010 checks mechanically:
 *
 *   1. It lives HERE, in one file. It is NOT in `tokens.css`, NOT in the generated Compose theme, and
 *      NOT in `EffyTheme`. `tokens:check` and `cm-tokens-check` passing UNCHANGED is the proof.
 *   2. It is never surfaced to the theme system, so no `MaterialTheme.colorScheme` entry is added.
 *   3. Never a screen accent, fill, border or body-text colour. Status indicators only.
 *   4. ⚠ THE HUE IS NEVER TEXT. Every pill puts its colour in a DOT and leaves the label on the
 *      neutral ramp. Not decoration: the platform's success green measures 4.00:1 — above the 3:1 bar
 *      for a non-text UI indicator, below the 4.5:1 bar for text. A green label would break the very
 *      rule this palette is an exception to.
 *   5. Colour is never the sole carrier of meaning. Delete every hue and the receipt still reads.
 *   6. Removing this file's one object reverts the exception.
 *
 * ⚠ THIS DUPLICATES `apps/customer-web/app/checkout/_components/status-palette.ts` ON PURPOSE, and
 * that is the one place on this platform where duplication is the correct answer. Principle II says
 * cross-cutting values live in a shared package — but the shared package for colour IS the design
 * system, and putting these there is exactly what rules 1 and 2 forbid. The duplication IS the
 * boundary. Two small constants that must be edited together are a far smaller cost than a third hue
 * entering the platform's token set.
 */
object ReceiptStatusPalette {
    /** Payment received; order delivered. The platform's own success colour, used as a non-text dot. */
    @Composable
    @ReadOnlyComposable
    fun paidDot(): Color = if (isDark()) Color(0xFF22C55E) else Color(0xFF0C9409)

    @Composable
    @ReadOnlyComposable
    fun paidTint(): Color = if (isDark()) Color(0xFF12220F) else Color(0xFFEEF7EE)

    /** ⚠ THE ONE GENUINELY NEW HUE. Marks an expedited package the shopper paid more for. */
    @Composable
    @ReadOnlyComposable
    fun sameDayDot(): Color = if (isDark()) Color(0xFFF0A04B) else Color(0xFFB45309)

    @Composable
    @ReadOnlyComposable
    fun sameDayTint(): Color = if (isDark()) Color(0xFF241A0C) else Color(0xFFFDF3E7)

    /** Needs attention. The platform's own destructive colour; drawn now for a later refunds slice. */
    @Composable
    @ReadOnlyComposable
    fun attentionDot(): Color = if (isDark()) Color(0xFFFF6B6B) else Color(0xFFE01010)

    /**
     * ⚠ Appearance is read from the THEME, not from a system flag. The app has a user-selectable
     * Light / Dark / Follow-System control, so a device-level check would disagree with an explicit
     * choice. `surface` luminance is what the rest of the app has already resolved.
     */
    @Composable
    @ReadOnlyComposable
    private fun isDark(): Boolean = MaterialTheme.colorScheme.surface.luminance() < 0.5f
}

/** Perceptual luminance, enough to tell one appearance from the other. */
private fun Color.luminance(): Float = 0.2126f * red + 0.7152f * green + 0.0722f * blue
