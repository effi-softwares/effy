package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.presentation.BrowseViewModel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Browse turns a FLAT category list into displayable groups. Each rule below exists because the
 * alternative shows a shopper something untrue, so they are pinned here rather than left to the view.
 */
class BrowseGroupingTest {

    private fun category(key: String, parent: String? = null, count: Int = 5) =
        Category(key = key, name = key, parentKey = parent, productCount = count, imageUrl = null)

    @Test
    fun groups_children_under_their_root() {
        val groups = BrowseViewModel.group(
            listOf(
                category("food"),
                category("fruit", parent = "food"),
                category("veg", parent = "food"),
            ),
        )

        assertEquals(1, groups.size)
        assertEquals("food", groups.single().root.key)
        assertEquals(listOf("fruit", "veg"), groups.single().children.map { it.key })
    }

    /** A tile promising products that a tap does not deliver is worse than no tile at all. */
    @Test
    fun drops_categories_with_no_products() {
        val groups = BrowseViewModel.group(
            listOf(
                category("food"),
                category("fruit", parent = "food", count = 3),
                category("empty", parent = "food", count = 0),
            ),
        )

        assertEquals(listOf("fruit"), groups.single().children.map { it.key })
    }

    /** A top-level category with nothing beneath it is still browsable — it stands in as its own child. */
    @Test
    fun a_childless_root_is_browsable_rather_than_an_empty_section() {
        val groups = BrowseViewModel.group(listOf(category("drinks")))

        assertEquals(1, groups.size)
        assertEquals(listOf("drinks"), groups.single().children.map { it.key })
    }

    /** A flat taxonomy is a legitimate shape, not an error — everything must still be reachable. */
    @Test
    fun a_flat_taxonomy_renders_as_one_group() {
        val groups = BrowseViewModel.group(
            listOf(
                category("a", parent = "missing-root"),
                category("b", parent = "missing-root"),
            ),
        )

        assertEquals(1, groups.size)
        assertEquals(listOf("a", "b"), groups.single().children.map { it.key })
    }

    @Test
    fun an_entirely_empty_catalogue_yields_no_groups() {
        assertTrue(BrowseViewModel.group(emptyList()).isEmpty())
        assertTrue(BrowseViewModel.group(listOf(category("food", count = 0))).isEmpty())
    }
}
