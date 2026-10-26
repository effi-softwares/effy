package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.presentation.CATEGORY_FALLBACK_ICON
import com.effyshopping.customer.mobile.features.catalog.presentation.CATEGORY_ICONS
import com.effyshopping.customer.mobile.features.catalog.presentation.categoryIcon
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_milk
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

/** 101 — a category's glyph is the key staff chose, the same set the website and the database know. */
class CategoryIconsTest {
    private val fixture = Json.parseToJsonElement(CATEGORY_ICONS_FIXTURE).jsonObject
    private val keys = fixture.getValue("icons").jsonArray.map { it.jsonPrimitive.content }

    @Test
    fun `the map is exactly the shared icon keys`() {
        assertEquals(keys, CATEGORY_ICONS.keys.toList())
    }

    @Test
    fun `a key is its own glyph, and none or an unknown one is the neutral box`() {
        assertEquals(Res.drawable.lucide_milk, categoryIcon("milk"))
        assertEquals(CATEGORY_FALLBACK_ICON, categoryIcon(null))
        assertEquals(CATEGORY_FALLBACK_ICON, categoryIcon("rocket"))
        assertEquals(CATEGORY_ICONS.getValue(fixture.getValue("fallback").jsonPrimitive.content), CATEGORY_FALLBACK_ICON)
    }
}
