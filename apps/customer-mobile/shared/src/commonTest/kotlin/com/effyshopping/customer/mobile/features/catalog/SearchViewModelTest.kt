package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.FacetSet
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.ProductPage
import com.effyshopping.customer.mobile.features.catalog.domain.Promotion
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
import com.effyshopping.customer.mobile.features.catalog.domain.ProductSortOption
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** A fake catalog repo whose search returns two pages keyed by cursor. */
private class FakeCatalog : CatalogRepository {
    override suspend fun home() = HomeContent(emptyList(), emptyList())
    override suspend fun categories(): List<Category> = emptyList()
    override suspend fun productDetail(id: String): ProductDetail = throw NotImplementedError()

    /** Records what the last search asked for, so tests can assert the sort/category reached the port. */
    var lastSort: ProductSortOption? = null
    var lastCategoryKey: String? = null

    override suspend fun search(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        sort: ProductSortOption,
        cursor: String?,
        brands: List<String>,
        attributes: Map<String, List<String>>,
        minPrice: String?,
        maxPrice: String?,
    ): ProductPage {
        lastSort = sort
        lastCategoryKey = categoryKey
        val card = { id: String -> ProductCard(id, id, null, null, "5.00", "AUD", null, emptyList(), true) }
        return if (cursor == null) {
            ProductPage(items = listOf(card("a"), card("b")), nextCursor = "CURSOR", total = 3, sort = sort)
        } else {
            ProductPage(items = listOf(card("c")), nextCursor = null, total = 3, sort = sort)
        }
    }

    override suspend fun facets(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        brands: List<String>,
        attributes: Map<String, List<String>>,
        minPrice: String?,
        maxPrice: String?,
    ): FacetSet = FacetSet(priceBounds = null, facets = emptyList())

    override suspend fun promotion(id: String): Promotion = throw NotImplementedError()
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

    /**
     * The regression this pins: `SearchProducts` takes query, saleOnly, categoryKey, sort, cursor —
     * and `categoryKey` and `cursor` are BOTH `String?`. Passing the cursor positionally once bound it
     * to categoryKey with no compile error, which silently broke pagination and would have filtered
     * every result by a category named after a base64 cursor.
     */
    @Test
    fun paginationPassesTheCursorAsACursorAndNotAsACategory() = runTest(dispatcher) {
        val repo = FakeCatalog()
        val vm = SearchViewModel(SearchProducts(repo))
        vm.onQueryChange("milk")
        advanceUntilIdle()

        vm.loadMore()
        advanceUntilIdle()

        assertNull(repo.lastCategoryKey, "the cursor must never arrive as a category key")
    }

    @Test
    fun theResultTotalIsSurfaced() = runTest(dispatcher) {
        val vm = SearchViewModel(SearchProducts(FakeCatalog()))
        vm.onQueryChange("milk")
        advanceUntilIdle()

        assertEquals(3, vm.state.value.total, "the count describes the whole match set, not the page")
    }

    @Test
    fun changingSortReachesThePortAndRestartsTheList() = runTest(dispatcher) {
        val repo = FakeCatalog()
        val vm = SearchViewModel(SearchProducts(repo))
        vm.onQueryChange("milk")
        advanceUntilIdle()

        vm.applySort(ProductSortOption.PRICE_ASC)
        advanceUntilIdle()

        assertEquals(ProductSortOption.PRICE_ASC, repo.lastSort)
        // Restarted from the first page — carrying a cursor across an ordering change is a 400.
        assertEquals(listOf("a", "b"), vm.state.value.items.map { it.id })
    }

    /** Best match has nothing to rank by without a query, so the view model stops asking for it. */
    @Test
    fun relevanceIsAbandonedWhenTheQueryIsCleared() = runTest(dispatcher) {
        val repo = FakeCatalog()
        val vm = SearchViewModel(SearchProducts(repo))
        vm.onQueryChange("milk")
        advanceUntilIdle()
        vm.applySort(ProductSortOption.RELEVANCE)
        advanceUntilIdle()

        vm.onQueryChange("")
        advanceUntilIdle()

        assertEquals(ProductSortOption.NEWEST, repo.lastSort)
    }
}
