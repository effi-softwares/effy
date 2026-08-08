// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
// The brand lives in tokens.css ONCE (constitution Principle V); this file is derived and diff-guarded (013 D16).
package com.effyshopping.mobile.design

import androidx.compose.ui.unit.dp

/** Corner radii (dp) — sm/md pinned to equal the web --radius-sm/md; default = md. Pill via RoundedCornerShape(50%). */
object EffyRadius {
    val sm = 6.dp
    val md = 8.dp
    val default = 10.dp
}

/** The Effy spacing scale (dp), mirroring the design tokens (xs 4 · s 8 · md 12 · lg 16 · xl 20 · 4xl 40 → xxxl). */
object EffySpacing {
    val xs = 4.dp
    val s = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 20.dp
    val xxxl = 40.dp
}

/**
 * The canonical promotional banner canvas (029), from packages/shared-types/src/banner-canvas.json.
 *
 * ⚠ EMITTED INTO THIS FILE ON PURPOSE, not into a new EffyBannerTokens.kt. `check-compose-theme.mjs`
 * carries a hardcoded list of the files it guards, and its own comment warns that anything the
 * generator writes which is missing from that list is UNGUARDED. A new file would have been generated
 * and silently undefended — the exact failure the generate-and-check pattern exists to prevent.
 *
 * ⚠ [ratio] is what makes cropping a non-problem: the render box uses it, and conformant artwork
 * shares it, so the scale is uniform and nothing is ever cropped (029 research R2).
 */
object EffyBanner {
    /** The authored canvas, in pixels. Artwork conforms to exactly this. */
    const val widthPx = 1200
    const val heightPx = 600

    /** Width ÷ height. The render box is locked to this at every window size. */
    const val ratio = 2f

    /** Above this the banner is centred rather than grown — a tablet gets no promotional slab. */
    val maxRenderWidth = 600.dp

    /**
     * Where the live message is drawn over the artwork, as fractions of the canvas.
     *
     * ⚠ NOT a trim-safe region — nothing is ever trimmed. This is the part of an operator's picture
     * the platform prints text on, which is what they need to leave quiet.
     */
    const val textInsetLeft = 0.06f
    const val textInsetBottom = 0.06f
    const val textWidth = 0.58f
    const val textHeight = 0.5f
}
