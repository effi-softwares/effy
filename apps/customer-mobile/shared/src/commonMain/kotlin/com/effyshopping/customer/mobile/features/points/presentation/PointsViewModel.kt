package com.effyshopping.customer.mobile.features.points.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.points.domain.GetOlderPoints
import com.effyshopping.customer.mobile.features.points.domain.GetPoints
import com.effyshopping.customer.mobile.features.points.domain.PointsBalance
import com.effyshopping.customer.mobile.features.points.domain.PointsLine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Effy points (074 US1) — `ViewModel → UseCase → Repository` (Principle VI).
 *
 * ⚠ THREE STATES, NOT TWO, as the payment-methods screen draws them: loading, a balance (which may be
 * zero), and "we could not ask". A failed read rendered as "0 points" is a false statement about the
 * customer's own account.
 */
data class PointsUiState(
    val loading: Boolean = true,
    val loadFailed: Boolean = false,
    val balance: PointsBalance? = null,
    val lines: List<PointsLine> = emptyList(),
    val nextCursor: String? = null,
    val loadingOlder: Boolean = false,
)

class PointsViewModel(
    private val getPoints: GetPoints,
    private val getOlderPoints: GetOlderPoints,
    /** 071 — "your points changed, or the channel just (re)connected: read now". */
    liveChanges: Flow<Unit>,
) : ViewModel() {

    private val _state = MutableStateFlow(PointsUiState())
    val state: StateFlow<PointsUiState> = _state.asStateFlow()

    init {
        load()
        // The same quiet re-read as a pull-to-refresh: what is on screen stays on screen.
        viewModelScope.launch { liveChanges.collect { refresh() } }
    }

    fun load() {
        _state.value = _state.value.copy(loading = true, loadFailed = false)
        viewModelScope.launch {
            try {
                val (balance, page) = getPoints()
                _state.value = PointsUiState(loading = false, balance = balance, lines = page.lines, nextCursor = page.nextCursor)
            } catch (e: AppException) {
                _state.value = _state.value.copy(loading = false, loadFailed = true)
            }
        }
    }

    /** Re-read without clearing the screen. A failure keeps what is shown. */
    suspend fun refresh() {
        try {
            val (balance, page) = getPoints()
            _state.value = PointsUiState(loading = false, balance = balance, lines = page.lines, nextCursor = page.nextCursor)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            // Keep what is on screen.
        }
    }

    fun loadOlder() {
        val cursor = _state.value.nextCursor ?: return
        if (_state.value.loadingOlder) return
        _state.value = _state.value.copy(loadingOlder = true)
        viewModelScope.launch {
            try {
                val page = getOlderPoints(cursor)
                _state.value = _state.value.copy(loadingOlder = false, lines = _state.value.lines + page.lines, nextCursor = page.nextCursor)
            } catch (e: AppException) {
                _state.value = _state.value.copy(loadingOlder = false)
            }
        }
    }
}
