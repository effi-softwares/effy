package com.effyshopping.driver.mobile.features.collection.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.error.isFinal
import com.effyshopping.driver.mobile.core.offline.ActionIds
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.collection.domain.CheckInHub
import com.effyshopping.driver.mobile.features.collection.domain.CollectStop
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.GetCollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.GetShopStop
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.PackageOutcome
import com.effyshopping.driver.mobile.features.collection.domain.ReportedProblem
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.collection.domain.StopDraft
import com.effyshopping.driver.mobile.features.collection.domain.StopDrafts
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
     * ⚠ **Ticking sends nothing.** Every package's outcome goes with the one "collect" call on the
     * swipe commit. Until then the ticks and reports are kept on the phone ([StopDrafts]), so they
     * are still there if the app is closed while the driver is loading.
     */
    val confirmedPackageIds: Set<String> = emptySet(),
    /** Packages the driver said they are NOT collecting, by [CollectionPackage.key]. Sent with the collect. */
    val reportedPackages: Map<String, PackageProblem> = emptyMap(),
    /**
     * The check-in was made with no signal and is saved to send (backlog C2). The split it answers
     * with is read once it has been sent.
     */
    val checkInSending: Boolean = false,
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
    /** Where the stop in progress is kept across the app being closed. Null in tests that do not care. */
    private val drafts: StopDrafts? = null,
    /** The changeIds still waiting in the offline queue — how a saved check-in learns it was sent. */
    private val pendingChangeIds: Flow<Set<String>> = emptyFlow(),
) : ViewModel() {
    private val _state = MutableStateFlow(CollectionUiState())
    val state = _state.asStateFlow()

    private val ids = ActionIds(newChangeId)

    /** The changeId of a check-in saved with no signal, until its answer has been read. */
    private var savedCheckIn: String? = null

    init {
        viewModelScope.launch { liveChanges.collect { reloadRunQuietly() } }
        viewModelScope.launch {
            pendingChangeIds.collect { pending ->
                val id = savedCheckIn ?: return@collect
                if (id !in pending) readSavedCheckIn(id)
            }
        }
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
        reloadStopQuietly()
    }

    /**
     * 092 rev 2 — the stop on screen is re-read too: a package dispatch withdrew, or one the shop has
     * only now made ready, shows without the driver leaving the screen. ⚠ The driver's ticks and
     * reports are KEPT for every package still there (they are the work in progress); one for a package
     * that has gone is dropped, so the collect never names a package the stop no longer has.
     */
    private suspend fun reloadStopQuietly() {
        val open = _state.value.stop ?: return
        runCatching { getStop(runId, open.stopId) }.onSuccess { fresh ->
            _state.update { st ->
                if (st.isLoading || st.isWorking || st.stop?.stopId != fresh.stopId) return@update st
                val keys = fresh.packages.mapTo(mutableSetOf()) { it.key }
                st.copy(
                    stop = fresh,
                    confirmedPackageIds = st.confirmedPackageIds.filterTo(mutableSetOf()) { it in keys },
                    reportedPackages = st.reportedPackages.filterKeys { it in keys },
                )
            }
        }
    }

    /**
     * 092 rev 2 — the screen is showing (again). The first time it loads with its loading state; every
     * time after, it re-reads quietly. ⚠ A FALLBACK: the driver's own writes already re-read every
     * work screen through `WorkChanges` (the server never announces a driver's change back to them).
     * This catches what slips past that — a write made before the app last closed, a missed signal.
     */
    fun showRun(quiet: Boolean = false) {
        when {
            _state.value.run != null -> viewModelScope.launch { reloadRunQuietly() }
            !quiet -> loadRun()
            // A screen that works without the run (the stop, the hub — backlog F2) reads it with no
            // loading or error state of its own.
            else -> viewModelScope.launch {
                runCatching { getRun(runId) }.onSuccess { fresh -> _state.update { it.copy(run = it.run ?: fresh) } }
            }
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
            else {
                // A different stop — unless it is the one the driver was on when the app was closed.
                val kept = drafts?.load(runId, stopId)
                it.copy(
                    isLoading = true, stop = null, message = null,
                    confirmedPackageIds = kept?.confirmed.orEmpty(),
                    reportedPackages = kept?.reported.orEmpty().mapValues { (_, p) -> PackageProblem(p.kind, p.note) },
                )
            }
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
    fun collect(stopId: String, onDone: () -> Unit) = collect(stopId, emptyMap(), emptyList(), onDone)

    /**
     * [methods] — 092/096: how each BAG was handed over, by label code, from the scan screen. A bag of a
     * collected package with no scan was ticked (or swiped) by hand; [missing] are bags the driver said
     * were not at the shop (the package is collected, those bags are held).
     */
    fun collect(
        stopId: String,
        methods: Map<String, com.effyshopping.driver.mobile.core.scan.HandMethod>,
        missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag>,
        onDone: () -> Unit,
    ) {
        if (_state.value.isWorking) return
        val now = _state.value
        val packages = now.stop?.takeIf { it.stopId == stopId }?.packages.orEmpty()
        val outcomes = packages.mapNotNull { pkg ->
            val id = pkg.packageId ?: return@mapNotNull null
            val problem = now.reportedPackages[pkg.key]
            PackageOutcome(packageId = id, collected = problem == null, note = problem?.asNote())
        }
        val missingCodes = missing.map { it.code }.toSet()
        // 096 — every bag of every collected package: scanned, typed, ticked by hand, or declared missing.
        val handed = packages.filter { it.key !in now.reportedPackages }.flatMap { it.bags }
            .filter { it.code !in missingCodes }
            .map { com.effyshopping.driver.mobile.core.scan.HandedOver(it.code, methods[it.code] ?: com.effyshopping.driver.mobile.core.scan.HandMethod.MANUAL) }
        _state.update { it.copy(isWorking = true, message = null) }
        val action = "collect:$stopId"
        viewModelScope.launch {
            try {
                // Sent or saved to send, the stop is collected as far as the driver is concerned
                // (backlog C1): the queue banner says what is still on the phone.
                val result = collectStop(runId, stopId, ids.of(action), outcomes, handed, missing)
                ids.settled(action)
                if (result.remaining > 0) {
                    // 093 — a package was added while the driver was here. Only what they were shown is
                    // collected; the stop stays open and shows it. The ticks so far are kept.
                    _state.update { it.copy(isWorking = false) }
                    reloadStopQuietly()
                    val n = result.remaining
                    _state.update { it.copy(message = "${if (n == 1) "1 more package was" else "$n more packages were"} added — collect ${if (n == 1) "it" else "them"} before you leave.") }
                    return@launch
                }
                drafts?.clear()
                _state.update { it.copy(isWorking = false) }
                onDone()
            } catch (e: AppException) {
                if (e.error.isFinal()) ids.settled(action)
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
        keepDraft()
    }

    private fun keepDraft() {
        val now = _state.value
        val stopId = now.stop?.stopId ?: return
        drafts?.save(
            runId,
            StopDraft(
                stopId = stopId,
                confirmed = now.confirmedPackageIds,
                reported = now.reportedPackages.mapValues { (_, p) -> ReportedProblem(p.kind, p.note) },
            ),
        )
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
        keepDraft()
    }

    /** Undo a report: the package is neither reported nor ticked — the driver looks again. */
    fun withdrawReport(key: String) {
        _state.update { it.copy(reportedPackages = it.reportedPackages - key) }
        keepDraft()
    }

    /** 093/096 — [missing]: bags collected that are not in the van (reason `not_in_van`). */
    fun checkIn(handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(), missing: List<com.effyshopping.driver.mobile.core.scan.MissingBag> = emptyList()) {
        if (_state.value.isWorking || _state.value.checkInSending) return
        _state.update { it.copy(isWorking = true, message = null) }
        val id = ids.of(CHECK_IN)
        viewModelScope.launch {
            try {
                val split = checkInHub(runId, id, handed, missing)
                if (split == null) {
                    // Saved to send (backlog C2). Its answer is read once the queue has sent it.
                    savedCheckIn = id
                    _state.update { it.copy(isWorking = false, checkInSending = true) }
                } else {
                    ids.settled(CHECK_IN)
                    _state.update { it.copy(hubSplit = split, isWorking = false) }
                }
            } catch (e: AppException) {
                if (e.error.isFinal()) ids.settled(CHECK_IN)
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    /**
     * The saved check-in has left the queue: ask again under the SAME changeId. Check-in is
     * idempotent, so this answers with the split without checking in twice.
     */
    private suspend fun readSavedCheckIn(id: String) {
        savedCheckIn = null
        try {
            val split = checkInHub(runId, id)
            if (split == null) {
                savedCheckIn = id // offline again, and saved again: wait for the next send
                return
            }
            ids.settled(CHECK_IN)
            _state.update { it.copy(hubSplit = split, checkInSending = false) }
        } catch (e: AppException) {
            ids.settled(CHECK_IN)
            _state.update { it.copy(checkInSending = false, message = e.error.userMessage()) }
        }
    }

    private companion object {
        const val CHECK_IN = "checkin"
    }
}
