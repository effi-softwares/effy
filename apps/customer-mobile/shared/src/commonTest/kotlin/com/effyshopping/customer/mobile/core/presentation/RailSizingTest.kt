package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.design.EffyBanner
import com.effyshopping.mobile.kit.ui.WindowWidth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 028 T017 — the rail tile sizing rule (research R4).
 *
 * The rule is pure precisely so the two things that can go wrong with it can be asserted rather than
 * eyeballed on a device:
 *
 *   · **no peek** — a row whose last visible tile ends flush at the screen edge reads as a complete
 *     set, and a shopper never drags it. The peek IS the affordance FR-015 asks for.
 *   · **a stretched phone layout on a tablet** — the failure mode FR-046 exists to prevent, where a
 *     wider window simply makes each product bigger instead of showing more of them.
 */
class RailSizingTest {

    @Test
    fun `a compact window shows two tiles and a peek of the third`() {
        val fraction = railTileWidthFraction(WindowWidth.COMPACT)

        assertTrue(
            fraction * 2 < 1f,
            "two tiles must fit within the window, or there is nothing to peek past",
        )
        assertTrue(
            fraction * 3 > 1f,
            "three tiles must NOT fit — the third has to be cut off, because that sliver is the only " +
                "thing telling a shopper the row scrolls (FR-015)",
        )
    }

    @Test
    fun `wider windows fit more tiles rather than bigger ones`() {
        val compact = railTileWidthFraction(WindowWidth.COMPACT)
        val medium = railTileWidthFraction(WindowWidth.MEDIUM)
        val expanded = railTileWidthFraction(WindowWidth.EXPANDED)

        assertTrue(
            compact > medium && medium > expanded,
            "the fraction must SHRINK as the window grows. A tablet showing two half-screen-wide " +
                "products is a phone layout stretched, which is exactly what FR-046 forbids.",
        )
    }

    @Test
    fun `every width class leaves a peek`() {
        WindowWidth.entries.forEach { width ->
            val fraction = railTileWidthFraction(width)
            val whole = (1f / fraction).toInt()
            assertTrue(
                whole * fraction < 0.999f,
                "$width fits $whole tiles exactly with no remainder — the row would end flush at the " +
                    "edge and read as a complete set",
            )
        }
    }

    @Test
    fun `no width class produces a degenerate tile`() {
        WindowWidth.entries.forEach { width ->
            val fraction = railTileWidthFraction(width)
            assertTrue(fraction > 0f && fraction <= 0.5f, "$width produced an unusable tile width: $fraction")
        }
    }
}

/**
 * 029 T026 — the banner's render width.
 *
 * ⚠ Testing the PURE function, not the composable. 028 twice had layout maths pass a function test
 * and fail on a device, so this proves the rule and the device walk proves the layout. What it can
 * genuinely catch is the bound being absent, inverted, or applied on a phone.
 */
class BannerSizingTest {

    @Test
    fun `a phone gets the full available width`() {
        // The bound must not clamp on the devices it was never meant to affect.
        assertEquals(360.dp, bannerRenderWidth(360.dp))
        assertEquals(402.dp, bannerRenderWidth(402.dp))
    }

    @Test
    fun `a wide window is bounded rather than stretched`() {
        // ⚠ FR-015. Without this a tablet in landscape renders a banner as tall as half the screen —
        // at 2:1, a 1000dp-wide window would produce a 500dp slab.
        assertEquals(EffyBanner.maxRenderWidth, bannerRenderWidth(1000.dp))
        assertEquals(EffyBanner.maxRenderWidth, bannerRenderWidth(2000.dp))
    }

    @Test
    fun `the bound is never smaller than a large phone`() {
        // A bound below phone width would clamp the case it exists to leave alone.
        assertTrue(
            EffyBanner.maxRenderWidth >= 420.dp,
            "maxRenderWidth ${EffyBanner.maxRenderWidth} would apply on phones, which is not what it is for",
        )
    }

    @Test
    fun `the banner is never taller than half a typical viewport`() {
        // 028's FR-017 caps a Home section at 50% of the viewport, and the banner is a section. At
        // 2:1 on a 402dp-wide phone that is ~201dp against an ~874dp screen — but the assertion is
        // what stops a future ratio change quietly breaking it.
        val phoneWidth = 402.dp
        val phoneHeight = 874.dp
        val bannerHeight = bannerRenderWidth(phoneWidth) / EffyBanner.ratio
        assertTrue(
            bannerHeight < phoneHeight / 2,
            "a $bannerHeight banner on a $phoneHeight screen breaks FR-017's half-viewport cap",
        )
    }
}
