package com.effyshopping.driver.mobile.features.history.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.history.domain.GetHistory
import com.effyshopping.driver.mobile.features.history.domain.GetHistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.History
import com.effyshopping.driver.mobile.features.history.domain.HistoryDetail
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
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
    /** "your work changed": a round or drop that just finished belongs in this list. */
    private val liveChanges: Flow<Unit> = emptyFlow(),
) : ViewModel() {
    private val _state = MutableStateFlow(HistoryUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch { liveChanges.collect { reloadQuietly() } }
    }

    /** Re-read the list without the loading state: the driver did nothing, so nothing should appear to happen. */
    private suspend fun reloadQuietly() {
        if (_state.value.history == null || _state.value.isLoading) return
        runCatching { getHistory() }.onSuccess { fresh -> _state.update { it.copy(history = fresh) } }
    }

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
