package com.effyshopping.customer.mobile.core.presentation

import com.effyshopping.mobile.kit.ui.WindowWidth
import kotlin.test.Test
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
