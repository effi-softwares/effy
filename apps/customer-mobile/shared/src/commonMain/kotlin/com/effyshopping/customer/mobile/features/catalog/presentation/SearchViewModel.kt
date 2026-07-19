package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
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
    val items: List<ProductCard> = emptyList(),
    val cursor: String? = null,
    val loading: Boolean = false,
    val exhausted: Boolean = false,
)

/**
 * Search ViewModel (019 US4). Debounced query, keyset infinite scroll (append the next page while a
 * cursor remains). The View calls [onQueryChange]/[toggleSale]/[loadMore].
 */
class SearchViewModel(private val search: SearchProducts) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    private var reloadJob: Job? = null

    fun onQueryChange(q: String) {
        _state.value = _state.value.copy(query = q)
        reload()
    }

    fun toggleSale() {
        _state.value = _state.value.copy(saleOnly = !_state.value.saleOnly)
        reload()
    }

    private fun reload() {
        reloadJob?.cancel()
        reloadJob = viewModelScope.launch {
            delay(250) // debounce
            _state.value = _state.value.copy(loading = true, items = emptyList(), cursor = null, exhausted = false)
            try {
                val s = _state.value
                val page = search(s.query, s.saleOnly, null)
                _state.value = _state.value.copy(items = page.items, cursor = page.nextCursor, exhausted = page.nextCursor == null, loading = false)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun loadMore() {
        val s = _state.value
        if (s.loading || s.cursor == null) return
        _state.value = s.copy(loading = true)
        viewModelScope.launch {
            try {
                val page = search(s.query, s.saleOnly, s.cursor)
                _state.value = _state.value.copy(
                    items = _state.value.items + page.items,
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
