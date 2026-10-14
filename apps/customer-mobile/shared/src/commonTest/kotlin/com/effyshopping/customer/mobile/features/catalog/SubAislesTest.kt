package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.aisleOf
import com.effyshopping.customer.mobile.features.catalog.domain.subAislesOf
import kotlin.test.Test
import kotlin.test.assertEquals

/** 087 FR-035 — an aisle shows its sub-aisles; an empty one is not offered. */
class SubAislesTest {
    private fun c(key: String, parent: String? = null, count: Int = 3) = Category(key, key, parent, count, null)
    private val cats = listOf(c("dairy_eggs"), c("milk", "dairy_eggs"), c("cheese", "dairy_eggs"), c("eggs", "dairy_eggs", 0), c("fruit_veg"))

    @Test
    fun `children with stock, in served order`() {
        assertEquals(listOf("milk", "cheese"), subAislesOf("dairy_eggs", cats).map { it.key })
        assertEquals(emptyList(), subAislesOf("fruit_veg", cats))
    }

    @Test
    fun `a sub-aisle belongs to its parent aisle`() {
        assertEquals("dairy_eggs", aisleOf("milk", cats))
        assertEquals("dairy_eggs", aisleOf("dairy_eggs", cats))
        assertEquals("unknown", aisleOf("unknown", cats))
    }
}
