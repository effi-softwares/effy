package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.GetCategories
import com.effyshopping.customer.mobile.features.catalog.domain.GetHome
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The Home tab's immutable, observable UI state (MVVM, constitution Principle VI amended v1.8.0). */
sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Ready(val home: HomeContent, val categories: List<Category>) : HomeUiState
    data object Error : HomeUiState
}

/**
 * The Home ViewModel (019 US1). Loads the merchandised Home + categories from the hot path and exposes a
 * single immutable [HomeUiState]; the View calls [load] for retry. No Android/iOS types — pure common.
 */
class HomeViewModel(
    private val getHome: GetHome,
    private val getCategories: GetCategories,
) : ViewModel() {

    private val _state = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = HomeUiState.Loading
            try {
                val home = getHome()
                val categories = getCategories()
                _state.value = HomeUiState.Ready(home, categories)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = HomeUiState.Error
            }
        }
    }
}
