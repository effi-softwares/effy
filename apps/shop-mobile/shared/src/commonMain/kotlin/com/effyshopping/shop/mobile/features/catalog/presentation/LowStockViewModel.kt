package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.GetLowStock
import com.effyshopping.shop.mobile.features.catalog.domain.LowStockItem
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** ONE immutable, observable state object the view renders (MVVM, Principle VI). */
data class LowStockUiState(
    val items: List<LowStockItem> = emptyList(),
    val isLoading: Boolean = true,
    val message: String? = null,
) {
    val outOfStockCount: Int get() = items.count { it.outOfStock }
}

class LowStockViewModel(
    private val getLowStock: GetLowStock,
    private val coroutineScope: CoroutineScope? = null,
) : ViewModel() {
    private val mutableState = MutableStateFlow(LowStockUiState())
    val state = mutableState.asStateFlow()
    private val scope: CoroutineScope get() = coroutineScope ?: viewModelScope

    init {
        refresh()
    }

    fun refresh() {
        mutableState.update { it.copy(isLoading = true, message = null) }
        scope.launch {
            try {
                val items = getLowStock()
                mutableState.update { it.copy(items = items, isLoading = false) }
            } catch (e: AppException) {
                // ⚠ The view never sees an AppError — `copyFor` is shared with StockViewModel so one
                // refusal reads the same way wherever it is shown.
                mutableState.update { it.copy(isLoading = false, message = copyFor(e.error)) }
            }
        }
    }
}
