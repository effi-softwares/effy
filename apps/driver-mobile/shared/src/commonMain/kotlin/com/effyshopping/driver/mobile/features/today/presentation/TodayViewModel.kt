package com.effyshopping.driver.mobile.features.today.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.driver.domain.SetDuty
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis
import com.effyshopping.driver.mobile.features.today.domain.DayStats
import com.effyshopping.driver.mobile.features.today.domain.GetToday
import com.effyshopping.driver.mobile.features.today.domain.ShiftClock
import com.effyshopping.driver.mobile.features.today.domain.Today
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
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
    /**
     * ⚠ 060: the offline write queue has existed since 049 and has never had an interface. A driver
     * in a basement loading dock — which is where this app is used — could not tell whether the app
     * was broken or the signal was.
     */
    val offline: Boolean = false,
    /** When the shown run was last read from the platform — the offline banner's "Last synced". */
    val syncedAtEpochMillis: Long? = null,
    /**
     * ⚠ Distinct from [message], which today does double duty as both error text and informational
     * text — so a screen cannot tell a failed load from a note and renders both as a red line.
     */
    val loadFailed: Boolean = false,
    /** Activity items the driver has not opened yet — the number beside "Activity". */
    val newActivity: Int = 0,
    /** What was finished today; null until it has been read (and the figures are then not drawn). */
    val dayStats: DayStats? = null,
    /** How long the last shift on this phone ran; null when not known. */
    val lastShiftMillis: Long? = null,
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
    /** 071 — "your work changed, or the channel just (re)connected: read now". Empty in tests. */
    private val liveChanges: Flow<Unit> = emptyFlow(),
    /** How many activity items are new to this driver. */
    private val countNewActivity: suspend () -> Int = { 0 },
    /** What was finished today, from the driver's history. */
    private val loadDayStats: suspend () -> DayStats? = { null },
    private val shiftClock: ShiftClock? = null,
    private val now: () -> Long = ::nowEpochMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(
        TodayUiState(dutyStatus = initialDuty, lastShiftMillis = shiftClock?.lastShiftMillis()),
    )
    val state = _state.asStateFlow()

    init {
        if (initialDuty == DutyStatus.ON_DUTY) refresh()
        refreshSideInfo()
        viewModelScope.launch { liveChanges.collect { refreshQuietly() } }
    }

    /**
     * Work was assigned, reassigned, withdrawn or re-ordered. Re-read without the loading state — the
     * driver did nothing, so nothing should appear to be happening — and without touching a message
     * they have not dismissed. Skipped while a visible load is already running.
     */
    private suspend fun refreshQuietly() {
        val now = _state.value
        if (now.dutyStatus != DutyStatus.ON_DUTY || now.isLoading) return
        // The channel also speaks when it reconnects — the moment queued writes can be sent (FR-040).
        // Until now they waited for the driver to pull to refresh on this one screen.
        runCatching { syncFlush() }
        runCatching { getToday() }.onSuccess { fresh ->
            _state.update {
                it.copy(
                    today = fresh, loadFailed = false, offline = fresh.stale,
                    syncedAtEpochMillis = if (fresh.stale) it.syncedAtEpochMillis else now(),
                )
            }
        }
        readSideInfo()
    }

    /**
     * The two things beside the round: how much activity is new, and what was finished today.
     * Best-effort and silent — neither is worth an error on the home screen.
     */
    fun refreshSideInfo() {
        viewModelScope.launch { readSideInfo() }
    }

    private suspend fun readSideInfo() {
        runCatching { countNewActivity() }.onSuccess { n -> _state.update { it.copy(newActivity = n) } }
        runCatching { loadDayStats() }.onSuccess { stats -> if (stats != null) _state.update { it.copy(dayStats = stats) } }
    }

    fun refresh() {
        if (_state.value.dutyStatus != DutyStatus.ON_DUTY) return
        _state.update { it.copy(isLoading = true, message = null) }
        viewModelScope.launch {
            runCatching { syncFlush() } // drain any queued offline writes before re-reading (FR-040)
            try {
                val fresh = getToday()
                _state.update {
                    it.copy(
                        today = fresh, isLoading = false, loadFailed = false, offline = fresh.stale,
                        syncedAtEpochMillis = if (fresh.stale) it.syncedAtEpochMillis else now(),
                    )
                }
                readSideInfo()
            } catch (e: AppException) {
                // ⚠ With nothing to show, a failed read is the error screen. It used to fall through
                // to the idle body, which told a driver whose run did not load "You're all caught up".
                _state.update {
                    // With a round already on screen, no connection is the offline banner over it.
                    val offline = e.error == AppError.Network && it.today != null
                    it.copy(
                        isLoading = false,
                        message = if (offline) null else e.error.userMessage(),
                        loadFailed = it.today == null,
                        offline = offline,
                    )
                }
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
                if (driver.dutyStatus == DutyStatus.ON_DUTY) shiftClock?.started(now()) else shiftClock?.ended(now())
                _state.update {
                    it.copy(
                        dutyStatus = driver.dutyStatus,
                        isTogglingDuty = false,
                        lastShiftMillis = shiftClock?.lastShiftMillis(),
                    )
                }
                if (driver.dutyStatus == DutyStatus.ON_DUTY) refresh()
                else {
                    _state.update { it.copy(today = null, loadFailed = false) }
                    readSideInfo()
                }
            } catch (e: AppException) {
                _state.update { it.copy(isTogglingDuty = false, message = e.error.userMessage()) }
            }
        }
    }
}
