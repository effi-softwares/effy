package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.domain.BrowseTarget
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.presentation.CategoryBrowseUiState
import com.effyshopping.customer.mobile.features.catalog.presentation.CategoryBrowseViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

/** 101 FR-033 - the app browses the tree level by level, down to five, and a leaf opens its products. */
@OptIn(ExperimentalCoroutinesApi::class)
class CategoryBrowseTest {
    private fun cat(key: String, parent: String?, depth: Int, leaf: Boolean, count: Int = 3) =
        Category(key = key, name = key.uppercase(), parentKey = parent, productCount = count, imageUrl = null, depth = depth, isLeaf = leaf, icon = null)

    // dept › aisle › shelf › bay › yoghurt (five levels); dept › empty (no products); dept › leaf
    private val tree = listOf(
        cat("dept", null, 1, false),
        cat("aisle", "dept", 2, false),
        cat("shelf", "aisle", 3, false),
        cat("bay", "shelf", 4, false),
        cat("yoghurt", "bay", 5, true),
        cat("empty", "dept", 2, true, count = 0),
        cat("leaf", "dept", 2, true),
    )

    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @AfterTest fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `the top level is the departments, a level lists its sub-categories with products`() = runTest {
        val top = CategoryBrowseViewModel(null) { tree }.state.value
        assertIs<CategoryBrowseUiState.Ready>(top)
        assertNull(top.level.parent)
        assertEquals(listOf("dept"), top.level.children.map { it.key })

        val dept = CategoryBrowseViewModel("dept") { tree }.state.value as CategoryBrowseUiState.Ready
        assertEquals("dept", dept.level.parent?.key)
        assertEquals(listOf("aisle", "leaf"), dept.level.children.map { it.key })
    }

    @Test
    fun `a category with sub-categories goes deeper, a leaf opens its products, five levels down`() = runTest {
        val vm = CategoryBrowseViewModel("dept") { tree }
        assertIs<BrowseTarget.Level>(vm.targetOf(tree.first { it.key == "aisle" }))
        assertIs<BrowseTarget.Products>(vm.targetOf(tree.first { it.key == "leaf" }))
        val bay = CategoryBrowseViewModel("bay") { tree }
        assertEquals(listOf("yoghurt"), (bay.state.value as CategoryBrowseUiState.Ready).level.children.map { it.key })
        assertIs<BrowseTarget.Products>(bay.targetOf(tree.first { it.key == "yoghurt" }))
    }

    @Test
    fun `a failed read says so, and retry reads again`() = runTest {
        var fail = true
        val vm = CategoryBrowseViewModel(null) { if (fail) error("offline") else tree }
        assertIs<CategoryBrowseUiState.Error>(vm.state.value)
        fail = false
        vm.load()
        assertIs<CategoryBrowseUiState.Ready>(vm.state.value)
    }
}
