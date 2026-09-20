package com.effyshopping.driver.mobile.features.collection.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.collection.domain.CheckInHub
import com.effyshopping.driver.mobile.features.collection.domain.CollectStop
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.GetCollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.GetShopStop
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.ReportCollectionIssue
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CollectionUiState(
    val run: CollectionRun? = null,
    val stop: ShopStop? = null,
    val hubSplit: HubSplit? = null,
    val isLoading: Boolean = false,
    val isWorking: Boolean = false,
    val message: String? = null,
    /**
     * Which packages the driver has ticked off at the current stop (060 FR-019). The manifest was
     * read-only before: a driver confirmed the whole stop with one button and had no way to work
     * through the packages as they loaded them.
     *
     * ⚠ **UI-LOCAL. Ticking sends nothing.** The existing single "collect" call still fires on the
     * swipe commit, which is what keeps 060 a presentation slice (FR-024) — a per-package endpoint
     * would be backend work. Stated consequence: this does NOT survive process death, so a driver who
     * leaves the stop and returns starts the ticking again. Recorded in the spec's edge cases rather
     * than discovered on a loading dock.
     */
    val confirmedPackageIds: Set<String> = emptySet(),
)

class CollectionViewModel(
    private val runId: String,
    private val getRun: GetCollectionRun,
    private val getStop: GetShopStop,
    private val collectStop: CollectStop,
    private val reportIssue: ReportCollectionIssue,
    private val checkInHub: CheckInHub,
    private val newChangeId: () -> String,
) : ViewModel() {
    private val _state = MutableStateFlow(CollectionUiState())
    val state = _state.asStateFlow()

    fun loadRun() {
        _state.update { it.copy(isLoading = true, message = null) }
        viewModelScope.launch {
            try {
                _state.update { it.copy(run = getRun(runId), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    fun loadStop(stopId: String) {
        _state.update { it.copy(isLoading = true, stop = null, message = null) }
        viewModelScope.launch {
            try {
                _state.update { it.copy(stop = getStop(runId, stopId), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    fun collect(stopId: String, onDone: () -> Unit) {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        viewModelScope.launch {
            try {
                collectStop(runId, stopId, newChangeId())
                _state.update { it.copy(isWorking = false) }
                onDone()
            } catch (e: AppException) {
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    /**
     * Tick or untick one package at the current stop (060 FR-019).
     *
     * ⚠ **Local only — this sends nothing.** The platform has no per-package collect endpoint, and
     * 060 is a presentation slice (FR-024). The single `collect` call still fires on the swipe
     * commit. Stated consequence: the ticks do not survive process death.
     */
    fun togglePackage(ref: String) {
        _state.update { st ->
            val next = st.confirmedPackageIds.toMutableSet()
            if (!next.add(ref)) next.remove(ref)
            st.copy(confirmedPackageIds = next)
        }
    }

    /** Clear the tick state when moving to a different stop, so it cannot bleed across stops. */
    fun clearConfirmations() {
        _state.update { it.copy(confirmedPackageIds = emptySet()) }
    }

    /**
     * Report a missing or short package (060 FR-021).
     *
     * ⚠ **The package reference is carried IN THE NOTE, not as its own field.** `reportIssue` has
     * no package parameter — 049 built it as a stop-level report — and adding one would be backend
     * work this slice excludes. Prefixing the note keeps the driver's answer legible to whoever
     * reads it in back-office, which is the only consumer today. Recorded rather than left as a
     * quiet encoding: a later slice that adds a real column should strip this prefix.
     */
    fun reportPackage(stopId: String, packageRef: String?, kind: String, note: String?) {
        val composed = listOfNotNull(
            packageRef?.takeIf { it.isNotBlank() }?.let { "Package $it" },
            note?.takeIf { it.isNotBlank() },
        ).joinToString(" — ").ifBlank { null }
        report(stopId, kind, composed)
    }

    fun report(stopId: String, kind: String, note: String?) {
        viewModelScope.launch {
            try {
                reportIssue(runId, stopId, kind, note, newChangeId())
                _state.update { it.copy(message = "Reported. Collect the rest as normal.") }
            } catch (e: AppException) {
                _state.update { it.copy(message = e.error.userMessage()) }
            }
        }
    }

    fun checkIn() {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        viewModelScope.launch {
            try {
                _state.update { it.copy(hubSplit = checkInHub(runId, newChangeId()), isWorking = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }
}
