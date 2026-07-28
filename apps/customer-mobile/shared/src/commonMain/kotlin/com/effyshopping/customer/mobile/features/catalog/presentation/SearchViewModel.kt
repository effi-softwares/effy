package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
    /** The ordering the SERVER applied — may differ from the request (see [applySort]). */
    val sort: ProductSortOption = ProductSortOption.NEWEST,
    val items: List<ProductCard> = emptyList(),
    /** Total matching the refinements, ignoring pagination. Null until the first page lands. */
    val total: Int? = null,
    val cursor: String? = null,
    val loading: Boolean = false,
    val exhausted: Boolean = false,
    val failed: Boolean = false,
)

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
class SearchViewModel(private val search: SearchProducts) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    private var reloadJob: Job? = null

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

    fun applyCategory(categoryKey: String?) {
        _state.value = _state.value.copy(categoryKey = categoryKey)
        reload()
    }

    fun applySort(sort: ProductSortOption) {
        if (_state.value.sort == sort) return
        _state.value = _state.value.copy(sort = sort)
        reload()
    }

    /** Clear every refinement except the text query (FR-015's "clear all"). */
    fun clearRefinements() {
        _state.value = _state.value.copy(saleOnly = false, categoryKey = null)
        reload()
    }

    private fun reload() {
        reloadJob?.cancel()
        reloadJob = viewModelScope.launch {
            delay(250) // debounce
            _state.value = _state.value.copy(
                loading = true,
                failed = false,
                items = emptyList(),
                total = null,
                cursor = null,
                exhausted = false,
            )
            try {
                val s = _state.value
                // ⚠ NAMED arguments, deliberately. `SearchProducts` takes four nullable-ish
                // parameters in a row, and passing the cursor positionally once bound it to
                // `categoryKey` — same type, no compile error, pagination silently broken. The test
                // caught it; naming them means the next person cannot reintroduce it.
                val page = search(
                    query = s.query,
                    saleOnly = s.saleOnly,
                    categoryKey = s.categoryKey,
                    sort = s.sort,
                    cursor = null,
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
