package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 087 FR-021 / SC-003 - fat-finger sizes are a requirement, so the kit's minimums are asserted rather
 * than trusted. Every component that takes a tap reads its size from [EffySize]; if a value here drops
 * below 48dp, every row, chip, stepper button and tab cell in the app drops with it.
 */
class KitSizingTest {

    @Test
    fun `every tappable size is at least 48dp`() {
        val tappable = mapOf(
            "target" to EffySize.target,
            "row" to EffySize.row,
            "rowWithSubtitle" to EffySize.rowWithSubtitle,
            "field" to EffySize.field,
            "primary" to EffySize.primary,
            "secondary" to EffySize.secondary,
            "tabRow" to EffySize.tabRow,
            "pushedBar" to EffySize.pushedBar,
            "largeTitleBar" to EffySize.largeTitleBar,
            "tile" to EffySize.tile,
        )
        tappable.forEach { (name, size) -> assertTrue(size >= 48.dp, "$name is $size, under the 48dp minimum") }
        assertEquals(EffySize.target, EffyMinTouchTarget, "the legacy name must mean the same minimum")
    }

    @Test
    fun `the canvas sizes are the ones the kit draws`() {
        // Foundations board: rows ~60, primary 52, tab row 58, gutter 16.
        assertEquals(60.dp, EffySize.row)
        assertEquals(52.dp, EffySize.primary)
        assertEquals(58.dp, EffySize.tabRow)
        assertEquals(16.dp, EffySize.gutter)
    }

    @Test
    fun `the storefront shapes are controls 6, cards 8, banners 12, sheets 16 - no pills`() {
        assertEquals(6.dp, EffyStorefrontShape.md)
        assertEquals(8.dp, EffyStorefrontShape.lg)
        assertEquals(12.dp, EffyStorefrontShape.xl)
        assertEquals(16.dp, EffyStorefrontShape.sheet)
        assertTrue(EffyStorefrontShape.md < EffySize.target / 2, "a control radius must not round a 48dp control into a pill")
    }
}
