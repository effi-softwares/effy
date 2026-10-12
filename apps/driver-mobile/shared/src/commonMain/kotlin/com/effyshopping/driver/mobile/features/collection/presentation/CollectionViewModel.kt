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
import com.effyshopping.driver.mobile.features.collection.domain.PackageOutcome
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
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
    /** Packages the driver said they are NOT collecting, by [CollectionPackage.key]. Sent with the collect. */
    val reportedPackages: Map<String, PackageProblem> = emptyMap(),
)

/** What is wrong with a package the driver is leaving at the shop. [kind] is the words they chose. */
data class PackageProblem(val kind: String, val note: String?) {
    fun asNote(): String = listOfNotNull(kind, note).joinToString(" — ")
}

class CollectionViewModel(
    private val runId: String,
    private val getRun: GetCollectionRun,
    private val getStop: GetShopStop,
    private val collectStop: CollectStop,
    private val checkInHub: CheckInHub,
    private val newChangeId: () -> String,
    /** 071 — "your work changed, or the channel just (re)connected: read now". Empty in tests. */
    private val liveChanges: Flow<Unit> = emptyFlow(),
) : ViewModel() {
    private val _state = MutableStateFlow(CollectionUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch { liveChanges.collect { reloadRunQuietly() } }
    }

    /**
     * A dispatcher changed this round (re-ordered its stops, moved it, withdrew it). Re-read the
     * round the driver is looking at, quietly.
     *
     * ⚠ NEVER WHILE THE DRIVER IS MID-ACTION (FR-016): a load or a submission of theirs is in
     * flight and its own answer is about to replace this state. And only once a round has loaded —
     * the first load is `loadRun`'s, with its own loading and error states.
     */
    private suspend fun reloadRunQuietly() {
        val now = _state.value
        if (now.run == null || now.isLoading || now.isWorking) return
        runCatching { getRun(runId) }.onSuccess { fresh ->
            _state.update { if (it.isLoading || it.isWorking) it else it.copy(run = fresh) }
        }
    }

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
        // ⚠ Ticks and reports belong to ONE stop. They are dropped when a different stop opens — and
        // kept when the same one is opened again, which is what coming back from the problem screen is.
        _state.update {
            if (it.stop?.stopId == stopId) it.copy(isLoading = true, message = null)
            else it.copy(
                isLoading = true, stop = null, message = null,
                confirmedPackageIds = emptySet(), reportedPackages = emptyMap(),
            )
        }
        viewModelScope.launch {
            try {
                _state.update { it.copy(stop = getStop(runId, stopId), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    /**
     * Commit the stop. ⚠ Every package's outcome goes IN this one request (063 FR-026): a package the
     * driver reported is sent as not collected with what was wrong, and the rest as collected.
     */
    fun collect(stopId: String, onDone: () -> Unit) {
        if (_state.value.isWorking) return
        val now = _state.value
        val outcomes = now.stop?.takeIf { it.stopId == stopId }?.packages.orEmpty().mapNotNull { pkg ->
            val id = pkg.packageId ?: return@mapNotNull null
            val problem = now.reportedPackages[pkg.key]
            PackageOutcome(packageId = id, collected = problem == null, note = problem?.asNote())
        }
        _state.update { it.copy(isWorking = true, message = null) }
        viewModelScope.launch {
            try {
                collectStop(runId, stopId, newChangeId(), outcomes)
                _state.update { it.copy(isWorking = false) }
                onDone()
            } catch (e: AppException) {
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    /**
     * Tick or untick one package at the current stop (060 FR-019). A memory aid while loading: the
     * stop screen asks before committing with a package neither ticked nor reported. Ticking a
     * reported package withdraws the report — it is in the van after all.
     */
    fun togglePackage(key: String) {
        _state.update { st ->
            val next = st.confirmedPackageIds.toMutableSet()
            if (!next.add(key)) next.remove(key)
            st.copy(confirmedPackageIds = next, reportedPackages = st.reportedPackages - key)
        }
    }

    /**
     * Record that one package is not being collected, and why (060 FR-021).
     *
     * ⚠ NOTHING IS SENT HERE. The report rides the stop's collect, so it can never arrive without
     * the collect or the collect without it. Until this, the report was its own request that named no
     * package, and the platform marked every package at the stop unavailable.
     */
    fun reportPackage(key: String, kind: String, note: String?) {
        _state.update { st ->
            st.copy(
                reportedPackages = st.reportedPackages + (key to PackageProblem(kind, note?.takeIf { it.isNotBlank() })),
                confirmedPackageIds = st.confirmedPackageIds - key,
            )
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
