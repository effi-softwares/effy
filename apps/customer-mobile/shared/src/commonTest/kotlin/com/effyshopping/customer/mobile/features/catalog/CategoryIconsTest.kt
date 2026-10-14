package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.presentation.CATEGORY_FALLBACK_ICON
import com.effyshopping.customer.mobile.features.catalog.presentation.categoryIcon
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_apple
import com.effyshopping.customer.mobile.resources.lucide_milk
import com.effyshopping.customer.mobile.resources.lucide_spray_can
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * 087 T057 — aisle glyphs follow the website's word rules, so a re-seeded catalogue still gets icons.
 *
 * ⚠ CHANGED BY 087: this pinned a twelve-key table from the 2026-07 taxonomy; 084 re-seeded the
 * catalogue and every top-level aisle fell through to the fallback. It now pins the 084 seed's
 * top-level aisles (`db/seeds/084_storefront_catalogue_dev.sql`) against the rules.
 */
class CategoryIconsTest {

    @Test
    fun `every 084 top-level aisle gets real artwork`() {
        val seeded = listOf(
            "fruit_veg", "dairy_eggs", "milk", "cheese", "plant_milk", "fruit", "vegetables",
            "organic_produce", "pasta_rice_pasta", "cleaning_laundry", "paper_goods_toilet_paper",
            "coffee_tea_cold_coffee", "biscuits_sweet_biscuits", "juice_fruit_juice",
        )
        seeded.forEach { key ->
            assertNotEquals(CATEGORY_FALLBACK_ICON, categoryIcon(key), "$key exists in the catalogue but has no icon")
        }
    }

    @Test
    fun `the rules match the website's order`() {
        assertEquals(Res.drawable.lucide_apple, categoryIcon("fruit_veg"))
        assertEquals(Res.drawable.lucide_milk, categoryIcon("dairy_eggs"))
        assertEquals(Res.drawable.lucide_spray_can, categoryIcon("cleaning_dishwashing"))
    }

    @Test
    fun `an unknown aisle gets the neutral glyph rather than nothing`() {
        assertEquals(CATEGORY_FALLBACK_ICON, categoryIcon("garden_tools"))
    }
}
