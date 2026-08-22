package com.effyshopping.driver.mobile.features.today.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.driver.domain.SetDuty
import com.effyshopping.driver.mobile.features.today.domain.GetToday
import com.effyshopping.driver.mobile.features.today.domain.Today
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Everything the Today home renders, in one immutable snapshot. Failures reach the UI as [message]. */
data class TodayUiState(
    val dutyStatus: DutyStatus = DutyStatus.OFF_DUTY,
    val today: Today? = null,
    val isLoading: Boolean = false,
    val isTogglingDuty: Boolean = false,
    val message: String? = null,
)

/**
 * The phase-aware home (049 FR-021). Owns the duty toggle (FR-005/006) and the Today read. When off
 * duty there is no work to load; going on duty loads Today. A per-action changeId makes the duty
 * request idempotent (R10).
 */
class TodayViewModel(
    initialDuty: DutyStatus,
    private val getToday: GetToday,
    private val setDuty: SetDuty,
    private val newChangeId: () -> String,
    /** Flush the offline write queue — called on refresh, the natural "back online" moment (FR-040). */
    private val syncFlush: suspend () -> Unit = {},
) : ViewModel() {
    private val _state = MutableStateFlow(TodayUiState(dutyStatus = initialDuty))
    val state = _state.asStateFlow()

    init {
        if (initialDuty == DutyStatus.ON_DUTY) refresh()
    }

    fun refresh() {
        if (_state.value.dutyStatus != DutyStatus.ON_DUTY) return
        _state.update { it.copy(isLoading = true, message = null) }
        viewModelScope.launch {
            runCatching { syncFlush() } // drain any queued offline writes before re-reading (FR-040)
            try {
                _state.update { it.copy(today = getToday(), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    fun toggleDuty() {
        if (_state.value.isTogglingDuty) return
        val goingOn = _state.value.dutyStatus == DutyStatus.OFF_DUTY
        _state.update { it.copy(isTogglingDuty = true, message = null) }
        viewModelScope.launch {
            try {
                val driver: Driver = setDuty(goingOn, newChangeId())
                _state.update { it.copy(dutyStatus = driver.dutyStatus, isTogglingDuty = false) }
                if (driver.dutyStatus == DutyStatus.ON_DUTY) refresh()
                else _state.update { it.copy(today = null) }
            } catch (e: AppException) {
                _state.update { it.copy(isTogglingDuty = false, message = e.error.userMessage()) }
            }
        }
    }
}
