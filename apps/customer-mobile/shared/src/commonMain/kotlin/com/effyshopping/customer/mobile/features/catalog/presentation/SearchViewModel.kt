package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.catalog.domain.FacetSet
import com.effyshopping.customer.mobile.features.catalog.domain.GetFacets
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.catalog.domain.ProductSortOption
import com.effyshopping.customer.mobile.features.catalog.domain.SearchProducts
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SearchUiState(
    val query: String = "",
    val saleOnly: Boolean = false,
    val categoryKey: String? = null,
    /** Selected brands — OR within (043 FR-003). */
    val brands: List<String> = emptyList(),
    /** Selected attribute values, keyed by attribute key — OR within a key, AND across (043 FR-003). */
    val attributes: Map<String, List<String>> = emptyMap(),
    val minPrice: String? = null,
    val maxPrice: String? = null,
    /** The ordering the SERVER applied — may differ from the request (see [applySort]). */
    val sort: ProductSortOption = ProductSortOption.NEWEST,
    val items: List<ProductCard> = emptyList(),
    /** Total matching the refinements, ignoring pagination. Null until the first page lands. */
    val total: Int? = null,
    val cursor: String? = null,
    val loading: Boolean = false,
    val exhausted: Boolean = false,
    val failed: Boolean = false,
    /** The available facets + counts for the current refinements (043 US2). Null until first load. */
    val facetSet: FacetSet? = null,
    val facetsLoading: Boolean = false,
) {
    /** How many filters are applied — drives the filter icon's badge (043 FR-014). */
    val activeFilterCount: Int
        get() = (if (categoryKey != null) 1 else 0) +
            (if (saleOnly) 1 else 0) +
            (if (minPrice != null || maxPrice != null) 1 else 0) +
            brands.size +
            attributes.values.sumOf { it.size }
}

/**
 * Search ViewModel (019 US4, extended by 025 US1).
 *
 * Debounced query, keyset infinite scroll, plus a caller-chosen ordering and a result count.
 *
 * ⚠ Every refinement change RESTARTS from the first page and drops the cursor. That is not a
 * convenience — a cursor is minted under one ordering and the server rejects it under another with
 * 400 `cursor_sort_mismatch` (FR-016b), because honouring it would compare a price against a timestamp
 * and silently drop and repeat products.
 */
class SearchViewModel(
    private val search: SearchProducts,
    // Optional so existing tests that only exercise search construct the VM with one argument. When
    // absent, the filter sheet simply shows no facets (043).
    private val getFacets: GetFacets? = null,
) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    private var reloadJob: Job? = null
    private var facetsJob: Job? = null

    init {
        // Load facets for the whole catalogue up front, so opening the filter sheet before typing shows
        // real options + counts (043 US1).
        refreshFacets(_state.value)
    }

    fun onQueryChange(q: String) {
        val previous = _state.value
        _state.value = previous.copy(
            query = q,
            // "Best match" has nothing to rank by without a query. Drop back to newest as the query
            // clears, so the control never offers an ordering the server will not honour.
            sort = if (q.isBlank() && previous.sort == ProductSortOption.RELEVANCE) {
                ProductSortOption.NEWEST
            } else {
                previous.sort
            },
        )
        reload()
    }

    fun toggleSale() {
        _state.value = _state.value.copy(saleOnly = !_state.value.saleOnly)
        reload()
    }

    /**
     * Set the sale refinement to an explicit value.
     *
     * ⚠ Distinct from [toggleSale] because the caller is entry navigation, not a tap: the Home
     * screen's "See all" on the on-sale rail arrives already knowing what it wants. Toggling from
     * there would clear the filter whenever the shopper came back to a Search tab that already had
     * it on — the classic bug where a link means the opposite of itself on second use.
     */
    fun applySaleOnly(saleOnly: Boolean) {
        if (_state.value.saleOnly == saleOnly) return
        _state.value = _state.value.copy(saleOnly = saleOnly)
        reload()
    }

    fun applyCategory(categoryKey: String?) {
        _state.value = _state.value.copy(categoryKey = categoryKey)
        reload()
    }

    /** Toggle one brand (OR within the brand facet — 043 FR-003). */
    fun toggleBrand(value: String) {
        val current = _state.value.brands
        val next = if (value in current) current - value else current + value
        _state.value = _state.value.copy(brands = next)
        reload()
    }

    /** Toggle one attribute value under [key] (OR within, AND across — 043 FR-003). */
    fun toggleAttribute(key: String, value: String) {
        val current = _state.value.attributes[key].orEmpty()
        val nextValues = if (value in current) current - value else current + value
        val next = _state.value.attributes.toMutableMap()
        if (nextValues.isEmpty()) next.remove(key) else next[key] = nextValues
        _state.value = _state.value.copy(attributes = next)
        reload()
    }

    /** Set the price band. Empty strings clear a bound (043 FR-004; min>max is corrected in the UI). */
    fun applyPrice(min: String?, max: String?) {
        _state.value = _state.value.copy(
            minPrice = min?.takeIf { it.isNotBlank() },
            maxPrice = max?.takeIf { it.isNotBlank() },
        )
        reload()
    }

    fun applySort(sort: ProductSortOption) {
        if (_state.value.sort == sort) return
        _state.value = _state.value.copy(sort = sort)
        reload()
    }

    /** Clear every refinement except the text query (FR-015's "clear all"). */
    fun clearRefinements() {
        _state.value = _state.value.copy(
            saleOnly = false,
            categoryKey = null,
            brands = emptyList(),
            attributes = emptyMap(),
            minPrice = null,
            maxPrice = null,
        )
        reload()
    }

    private fun reload() {
        reloadJob?.cancel()
        reloadJob = viewModelScope.launch {
            delay(250) // debounce — a burst of ticks becomes ONE refresh (043 FR-025)
            _state.value = _state.value.copy(
                loading = true,
                failed = false,
                items = emptyList(),
                total = null,
                cursor = null,
                exhausted = false,
            )
            val s = _state.value
            // Facets recompute on filter change, in parallel — never on the grid's critical path, and
            // never on paginate ([loadMore] does not call this).
            refreshFacets(s)
            try {
                // ⚠ NAMED arguments, deliberately. `SearchProducts` takes several nullable-ish
                // parameters in a row, and passing the cursor positionally once bound it to
                // `categoryKey` — same type, no compile error, pagination silently broken. The test
                // caught it; naming them means the next person cannot reintroduce it.
                val page = search(
                    query = s.query,
                    saleOnly = s.saleOnly,
                    categoryKey = s.categoryKey,
                    sort = s.sort,
                    cursor = null,
                    brands = s.brands,
                    attributes = s.attributes,
                    minPrice = s.minPrice,
                    maxPrice = s.maxPrice,
                )
                _state.value = _state.value.copy(
                    items = page.items,
                    total = page.total,
                    // The ordering the server ACTUALLY applied. Rendering the requested one would let
                    // the sort control misdescribe the list beneath it.
                    sort = page.sort,
                    cursor = page.nextCursor,
                    exhausted = page.nextCursor == null,
                    loading = false,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = _state.value.copy(loading = false, failed = true)
            }
        }
    }

    /** Recompute the facets for the given refinements (043 US2). A no-op when no facets use case is wired. */
    private fun refreshFacets(s: SearchUiState) {
        val getFacets = getFacets ?: return
        facetsJob?.cancel()
        facetsJob = viewModelScope.launch {
            _state.value = _state.value.copy(facetsLoading = true)
            try {
                val facetSet = getFacets(
                    query = s.query,
                    saleOnly = s.saleOnly,
                    categoryKey = s.categoryKey,
                    brands = s.brands,
                    attributes = s.attributes,
                    minPrice = s.minPrice,
                    maxPrice = s.maxPrice,
                )
                _state.value = _state.value.copy(facetSet = facetSet, facetsLoading = false)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = _state.value.copy(facetsLoading = false)
            }
        }
    }

    fun loadMore() {
        val s = _state.value
        if (s.loading || s.cursor == null) return
        _state.value = s.copy(loading = true)
        viewModelScope.launch {
            try {
                val page = search(
                    query = s.query,
                    saleOnly = s.saleOnly,
                    categoryKey = s.categoryKey,
                    sort = s.sort,
                    cursor = s.cursor,
                    // ⚠ The next page must carry the SAME filters, or paging silently widens the set.
                    brands = s.brands,
                    attributes = s.attributes,
                    minPrice = s.minPrice,
                    maxPrice = s.maxPrice,
                )
                _state.value = _state.value.copy(
                    items = _state.value.items + page.items,
                    total = page.total,
                    cursor = page.nextCursor,
                    exhausted = page.nextCursor == null,
                    loading = false,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }
}
