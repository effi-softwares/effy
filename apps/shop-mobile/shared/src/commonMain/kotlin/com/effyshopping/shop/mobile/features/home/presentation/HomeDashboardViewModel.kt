package com.effyshopping.shop.mobile.features.home.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.shop.mobile.features.home.domain.GetHomeDashboard
import com.effyshopping.shop.mobile.features.home.domain.HomeDashboard
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface HomeDashboardUiState {
    data object Loading : HomeDashboardUiState
    data class Ready(val dashboard: HomeDashboard) : HomeDashboardUiState
    data object Failed : HomeDashboardUiState
}

class HomeDashboardViewModel(private val getHomeDashboard: GetHomeDashboard) : ViewModel() {
    private val mutableState = MutableStateFlow<HomeDashboardUiState>(HomeDashboardUiState.Loading)
    val state = mutableState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        mutableState.value = HomeDashboardUiState.Loading
        viewModelScope.launch {
            mutableState.value = runCatching { getHomeDashboard() }
                .fold(
                    onSuccess = HomeDashboardUiState::Ready,
                    onFailure = { HomeDashboardUiState.Failed },
                )
        }
    }
}
