package com.effyshopping.mobile.kit.update

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withTimeoutOrNull

/** What the app draws instead of (or over) its own screens (121, data-model.md "Gate states"). */
sealed interface GateState {
    /** The launch surface, while the answer is awaited (at most [AppUpdateGate.launchWaitMs]). */
    data object Checking : GateState

    data object Mandatory : GateState

    data object Optional : GateState

    data class Notice(val latest: Int) : GateState

    /** The app's own screens. */
    data object Passed : GateState
}

enum class FlexibleDownload { Idle, Downloading, Downloaded }

/**
 * The launch gate (121). One per process, created in each app's `AppContainer`, so turning the phone or recreating the
 * activity never asks again; a **launch** (spec FR-005) is the first [onLaunch] in a process.
 *
 * - At launch: a saved answer under [freshMs] old is used at once; otherwise the answer is awaited for at most
 *   [launchWaitMs], then the saved answer, else the person is let in (FR-008, FR-009). The read always finishes in the
 *   background and is saved; a mandatory answer that arrives late takes over at once, anything else waits for the next
 *   launch.
 * - Back on screen ([onForeground]): read again; only mandatory is acted on (FR-006).
 * - On an Android install from Play, optional and notice are shown only when Play has the update for this phone
 *   (FR-015, a staged rollout); mandatory never asks.
 *
 * No timers: the waits are `withTimeoutOrNull`, never a `delay` loop (`scripts/check-no-refresh-timers.sh`).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppUpdateGate(
    private val source: AppUpdateSource,
    private val updater: StoreUpdater,
    /** This build's number (`versionCode` in version.properties, through BuildKonfig `APP_BUILD`). */
    val build: Int,
    private val now: () -> Long,
    private val scope: CoroutineScope,
    val launchWaitMs: Long = 1_500,
    private val freshMs: Long = 3 * 60_000,
    private val storeCheckMs: Long = 1_000,
) {
    private val _state = MutableStateFlow<GateState>(GateState.Checking)
    val state: StateFlow<GateState> = _state.asStateFlow()

    private val _download = MutableStateFlow(FlexibleDownload.Idle)
    val download: StateFlow<FlexibleDownload> = _download.asStateFlow()

    /** An optional update or a notice applies (shown or not) - Account's "Update available" row (FR-021). */
    private val _available = MutableStateFlow(false)
    val available: StateFlow<Boolean> = _available.asStateFlow()

    /** Whether Update now can do anything: a store page, or Play able to update in place. */
    private val _updateOffered = MutableStateFlow(false)
    val updateOffered: StateFlow<Boolean> = _updateOffered.asStateFlow()

    private var updatedFrom: Int? = null

    /**
     * The build the person was on when last asked to update, when this launch is on a newer one - once per process, for
     * the "update completed" event.
     */
    fun takeUpdatedFrom(): Int? = updatedFrom.also { updatedFrom = null }

    private var launched = false
    private var current: AppUpdateSettings? = null
    private var storeJob: Deferred<Boolean>? = null
    private val foregroundLock = Mutex()

    fun onLaunch() {
        if (launched) return
        launched = true
        source.promptedOnBuild()?.let { prompted ->
            if (prompted < build) updatedFrom = prompted
            source.setPromptedOnBuild(null)
        }
        // The store's answer runs alongside the read, so it costs no extra launch time.
        storeJob = if (updater.platform == AppPlatform.Android) scope.async { storeAllowsNow() } else null
        val fetch = scope.async { source.fetch() }
        scope.launch {
            val saved = source.saved()
            val fresh = saved?.takeIf { now() - it.second in 0 until freshMs }?.first
            val outcome = if (fresh != null) {
                withTimeoutOrNull(storeCheckMs) { decide(fresh, waitForStore = true) } ?: decide(fresh, waitForStore = false)
            } else {
                withTimeoutOrNull(launchWaitMs) { decide(fetch.await() ?: saved?.first, waitForStore = true) }
                    ?: decide(saved?.first, waitForStore = false)
            }
            apply(outcome)
            // The read finishes whatever happened above; a late mandatory takes over, a late lift releases.
            val late = fetch.await() ?: return@launch
            actOnMandatoryOnly(late)
        }
    }

    /** The app came back to the screen (FR-005, FR-006). */
    fun onForeground() {
        if (!launched) return
        scope.launch {
            if (!foregroundLock.tryLock()) return@launch
            try {
                val settings = source.fetch() ?: return@launch
                actOnMandatoryOnly(settings)
            } finally {
                foregroundLock.unlock()
            }
        }
    }

    /** Later, or the sheet dismissed (FR-011). */
    fun later() {
        val s = _state.value
        if (s is GateState.Optional || s is GateState.Notice) _state.value = GateState.Passed
    }

    /** Update now - from the mandatory screen, the sheet, or Account's row (FR-014). */
    fun updateNow() {
        val storeUrl = current?.forPlatform(updater.platform)?.storeUrl
        when (_state.value) {
            GateState.Mandatory -> scope.launch {
                if (!updater.startImmediate()) updater.openStore(storeUrl)
            }
            else -> {
                if (_state.value is GateState.Optional || _state.value is GateState.Notice) _state.value = GateState.Passed
                scope.launch {
                    if (_download.value != FlexibleDownload.Idle) return@launch // already downloading, or ready
                    _download.value = FlexibleDownload.Downloading
                    val started = updater.startFlexible { _download.value = FlexibleDownload.Downloaded }
                    if (!started) {
                        _download.value = FlexibleDownload.Idle
                        updater.openStore(storeUrl)
                    }
                }
            }
        }
    }

    /** The "Update downloaded · Restart" bar (US2). */
    fun restart() = updater.completeFlexible()

    /** The back gesture on the mandatory screen. */
    fun leaveApp() = updater.leaveApp()

    private suspend fun storeAllowsNow(): Boolean = runCatching {
        if (!updater.isStoreInstall()) true else updater.updateAvailable() == true
    }.getOrDefault(false)

    /** Whether the store allows optional and notice; when it cannot say in time, no (tried again next launch). */
    private suspend fun storeAllows(waitForStore: Boolean): Boolean {
        val job = storeJob ?: return true
        return when {
            job.isCompleted -> job.getCompleted()
            waitForStore -> job.await()
            else -> false
        }
    }

    private suspend fun decide(settings: AppUpdateSettings?, waitForStore: Boolean): Pair<AppUpdateSettings?, AppUpdateOutcome> {
        val plain = decideAppUpdate(settings, updater.platform, build, source.noticeShownFor(), storeAllows = true)
        if (plain !is AppUpdateOutcome.Optional && plain !is AppUpdateOutcome.Notice) return settings to plain
        val allows = storeAllows(waitForStore)
        return settings to decideAppUpdate(settings, updater.platform, build, source.noticeShownFor(), allows)
    }

    private suspend fun apply(decided: Pair<AppUpdateSettings?, AppUpdateOutcome>) {
        val (settings, outcome) = decided
        current = settings
        val allows = storeAllows(waitForStore = false)
        val ignoringNotice = decideAppUpdate(settings, updater.platform, build, noticeShownFor = null, storeAllows = allows)
        _available.value = ignoringNotice is AppUpdateOutcome.Optional || ignoringNotice is AppUpdateOutcome.Notice
        val storeUrl = settings?.forPlatform(updater.platform)?.storeUrl
        _updateOffered.value = storeUrl != null || (updater.platform == AppPlatform.Android && allows && runCatching { updater.isStoreInstall() }.getOrDefault(false))
        _state.value = when (outcome) {
            AppUpdateOutcome.Mandatory -> GateState.Mandatory
            AppUpdateOutcome.Optional -> GateState.Optional
            is AppUpdateOutcome.Notice -> {
                source.markNoticeShown(outcome.latest) // when shown, not when dismissed: a crash cannot repeat it
                GateState.Notice(outcome.latest)
            }
            AppUpdateOutcome.None -> GateState.Passed
        }
        if (outcome != AppUpdateOutcome.None) source.setPromptedOnBuild(build)
    }

    private suspend fun actOnMandatoryOnly(settings: AppUpdateSettings) {
        val mandatory = decideAppUpdate(settings, updater.platform, build, null, storeAllows = true) == AppUpdateOutcome.Mandatory
        when {
            mandatory && _state.value != GateState.Mandatory -> {
                current = settings
                _updateOffered.value = settings.forPlatform(updater.platform).storeUrl != null ||
                    (updater.platform == AppPlatform.Android && runCatching { updater.isStoreInstall() }.getOrDefault(false))
                source.setPromptedOnBuild(build)
                _state.value = GateState.Mandatory
            }
            // The minimum was lowered (or a stale saved answer was wrong): never keep someone locked out.
            !mandatory && _state.value == GateState.Mandatory -> {
                current = settings
                _state.value = GateState.Passed
            }
        }
    }
}
