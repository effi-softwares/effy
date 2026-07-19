package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.ProductPage
import com.effyshopping.customer.mobile.features.catalog.domain.SearchProducts
import com.effyshopping.customer.mobile.features.catalog.presentation.SearchViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** A fake catalog repo whose search returns two pages keyed by cursor. */
private class FakeCatalog : CatalogRepository {
    override suspend fun home() = HomeContent(emptyList(), emptyList())
    override suspend fun categories(): List<Category> = emptyList()
    override suspend fun productDetail(id: String): ProductDetail = throw NotImplementedError()

    override suspend fun search(query: String, saleOnly: Boolean, cursor: String?): ProductPage {
        val card = { id: String -> ProductCard(id, id, null, null, "5.00", "AUD", null, emptyList(), true) }
        return if (cursor == null) {
            ProductPage(items = listOf(card("a"), card("b")), nextCursor = "CURSOR")
        } else {
            ProductPage(items = listOf(card("c")), nextCursor = null)
        }
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class SearchViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(dispatcher) // viewModelScope uses Dispatchers.Main
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun firstPageThenLoadMoreAppendsAndExhausts() = runTest(dispatcher) {
        val vm = SearchViewModel(SearchProducts(FakeCatalog()))
        vm.onQueryChange("milk")
        advanceUntilIdle() // past the debounce + first fetch

        assertEquals(listOf("a", "b"), vm.state.value.items.map { it.id })
        assertEquals("CURSOR", vm.state.value.cursor)

        vm.loadMore()
        advanceUntilIdle()

        assertEquals(listOf("a", "b", "c"), vm.state.value.items.map { it.id })
        assertNull(vm.state.value.cursor)
        assertEquals(true, vm.state.value.exhausted)
    }
}
