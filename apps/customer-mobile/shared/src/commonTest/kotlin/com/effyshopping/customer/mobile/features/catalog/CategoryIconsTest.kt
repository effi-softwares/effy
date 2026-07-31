package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.presentation.MAPPED_CATEGORY_KEYS
import com.effyshopping.customer.mobile.features.catalog.presentation.categoryIcon
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_cat_fallback
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * 028 T029 — the category icon map.
 *
 * The interesting test here is the LAST one. An operator creating a category is routine, and the
 * fallback is the branch a device will almost never show a developer — which is exactly why it has to
 * be pinned in a test rather than trusted.
 */
class CategoryIconsTest {

    @Test
    fun `every mapped key resolves to real artwork`() {
        MAPPED_CATEGORY_KEYS.forEach { key ->
            assertNotEquals(
                Res.drawable.ic_cat_fallback,
                categoryIcon(key),
                "$key is declared as mapped but falls through to the fallback — the map and " +
                    "MAPPED_CATEGORY_KEYS have drifted apart",
            )
        }
    }

    @Test
    fun `every seeded taxonomy key is covered`() {
        // The taxonomy as migration 20260716092105 creates it. If the catalogue gains a top-level
        // category, this list is where a developer finds out that it will ship with a tag glyph.
        val seeded = listOf(
            "food", "grocery", "household",
            "meals", "bakery", "snacks",
            "pantry", "chilled", "frozen", "beverages",
            "cleaning", "paper_goods",
        )
        seeded.forEach { key ->
            assertTrue(key in MAPPED_CATEGORY_KEYS, "$key exists in the catalogue but has no icon")
        }
    }

    @Test
    fun `an unknown key gets the fallback rather than nothing`() {
        // The case an operator creates every time they add a category.
        assertEquals(
            Res.drawable.ic_cat_fallback,
            categoryIcon("pet_supplies"),
            "a category with no icon must render a neutral glyph — never a blank tile or a broken " +
                "frame (FR-026)",
        )
    }

    @Test
    fun `an empty key does not crash and gets the fallback`() {
        assertEquals(Res.drawable.ic_cat_fallback, categoryIcon(""))
    }

    @Test
    fun `key matching is case-insensitive`() {
        assertEquals(
            categoryIcon("grocery"),
            categoryIcon("Grocery"),
            "a key that differs only in case must not silently lose its icon",
        )
    }
}
