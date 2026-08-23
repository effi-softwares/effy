package com.effyshopping.driver.mobile.features.history.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.history.domain.GetHistory
import com.effyshopping.driver.mobile.features.history.domain.GetHistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.History
import com.effyshopping.driver.mobile.features.history.domain.HistoryDetail
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HistoryUiState(
    val history: History? = null,
    val detail: HistoryDetail? = null,
    val isLoading: Boolean = false,
    val message: String? = null,
) {
    val isEmpty: Boolean get() = history?.days?.isEmpty() == true && !isLoading
}

class HistoryViewModel(
    private val getHistory: GetHistory,
    private val getDetail: GetHistoryDetail,
) : ViewModel() {
    private val _state = MutableStateFlow(HistoryUiState())
    val state = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, message = null) }
        viewModelScope.launch {
            try {
                _state.update { it.copy(history = getHistory(), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    fun loadDetail(kind: String, id: String) {
        _state.update { it.copy(isLoading = true, detail = null, message = null) }
        viewModelScope.launch {
            try {
                _state.update { it.copy(detail = getDetail(kind, id), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }
}
