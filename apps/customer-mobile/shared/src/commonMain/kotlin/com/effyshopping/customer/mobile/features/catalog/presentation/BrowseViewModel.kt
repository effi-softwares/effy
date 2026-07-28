package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.GetCategories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** A top-level category and the categories beneath it — the shape browse renders. */
data class CategoryGroup(val root: Category, val children: List<Category>)

sealed interface BrowseUiState {
    data object Loading : BrowseUiState
    data object Error : BrowseUiState
    data class Ready(val groups: List<CategoryGroup>) : BrowseUiState
}

/**
 * Browse (025 US1 / FR-010) — the mobile half of the web `/browse` category index.
 *
 * Grouping happens here rather than in the view so it is testable without Compose, and so both
 * surfaces derive the same shape from the same flat list.
 */
class BrowseViewModel(private val getCategories: GetCategories) : ViewModel() {

    private val _state = MutableStateFlow<BrowseUiState>(BrowseUiState.Loading)
    val state: StateFlow<BrowseUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = BrowseUiState.Loading
            try {
                _state.value = BrowseUiState.Ready(group(getCategories()))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = BrowseUiState.Error
            }
        }
    }

    companion object {
        /**
         * Turn the flat category list into displayable groups.
         *
         * Rules, each of which exists because the alternative shows a shopper something untrue:
         *  - Empty categories are dropped. A tile promising products that a tap does not deliver is
         *    worse than no tile.
         *  - A FLAT taxonomy (nothing has a parent) is a legitimate shape, not an error — it renders
         *    as one unnamed group rather than disappearing.
         *  - A top-level category with no children is itself browsable, so it stands in as its own
         *    child rather than rendering an empty section.
         */
        fun group(categories: List<Category>): List<CategoryGroup> {
            val stocked = categories.filter { it.productCount > 0 }
            if (stocked.isEmpty()) return emptyList()

            val roots = stocked.filter { it.parentKey == null }
            if (roots.isEmpty()) {
                // No hierarchy at all — present everything as one group.
                return listOf(CategoryGroup(root = stocked.first(), children = stocked))
            }
            return roots.map { root ->
                val children = stocked.filter { it.parentKey == root.key }
                CategoryGroup(root = root, children = children.ifEmpty { listOf(root) })
            }
        }
    }
}
