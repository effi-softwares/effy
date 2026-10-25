// GENERATED FROM packages/design-system/src/tokens.css — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/design-system tokens:gen
package com.effyshopping.mobile.design

import androidx.compose.ui.unit.dp

/** Corner radii (dp) — sm/md pinned to equal the web --radius-sm/md; default = md. Pill via RoundedCornerShape(50%). */
object EffyRadius {
    val sm = 4.dp
    val md = 6.dp
    val default = 8.dp
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
 * The promotional banner canvas, from packages/shared-types/src/banner-canvas.json. The render box and
 * conformant artwork share [ratio], so nothing is ever cropped.
 */
object EffyBanner {
    /** The authored canvas, in pixels. Artwork conforms to exactly this. */
    const val widthPx = 1200
    const val heightPx = 600

    /** Width ÷ height. The render box is locked to this at every window size. */
    const val ratio = 2f

    /** Above this the banner is centred rather than grown. */
    val maxRenderWidth = 600.dp

    /** Where the live message is drawn over the artwork, as fractions of the canvas: the part an operator leaves quiet. */
    const val textInsetLeft = 0.06f
    const val textInsetBottom = 0.06f
    const val textWidth = 0.58f
    const val textHeight = 0.5f
}
