package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.catalog.domain.BrowseLevel
import com.effyshopping.customer.mobile.features.catalog.domain.BrowseTarget
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.browseLevel
import com.effyshopping.customer.mobile.features.catalog.domain.browseTarget
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface CategoryBrowseUiState {
    data object Loading : CategoryBrowseUiState
    data class Ready(val level: BrowseLevel, val categories: List<Category>) : CategoryBrowseUiState
    data object Error : CategoryBrowseUiState
}

/** One level of the category tree (101): the categories under [parentKey] (null = the departments). */
class CategoryBrowseViewModel(
    private val parentKey: String?,
    private val getCategories: suspend () -> List<Category>,
) : ViewModel() {
    private val _state = MutableStateFlow<CategoryBrowseUiState>(CategoryBrowseUiState.Loading)
    val state: StateFlow<CategoryBrowseUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = CategoryBrowseUiState.Loading
            _state.value = try {
                val all = getCategories()
                CategoryBrowseUiState.Ready(browseLevel(all, parentKey), all)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                CategoryBrowseUiState.Error
            }
        }
    }

    /** Where [category] leads from here: another level, or its products. */
    fun targetOf(category: Category): BrowseTarget {
        val all = (_state.value as? CategoryBrowseUiState.Ready)?.categories.orEmpty()
        return browseTarget(category, all)
    }
}
