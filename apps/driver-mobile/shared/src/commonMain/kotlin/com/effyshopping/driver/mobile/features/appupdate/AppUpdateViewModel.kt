package com.effyshopping.driver.mobile.features.appupdate

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.observability.AnalyticsDriver
import com.effyshopping.driver.mobile.core.observability.AnalyticsEvent
import com.effyshopping.mobile.kit.update.AppUpdateGate
import com.effyshopping.mobile.kit.update.FlexibleDownload
import com.effyshopping.mobile.kit.update.GateState
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * 121: the update screens' ViewModel. The decision and its state live in the process-scoped [AppUpdateGate]
 * (mobile-kit); this adds the user's actions and the analytics (platform-events.md, "App updates").
 */
class AppUpdateViewModel(
    private val gate: AppUpdateGate,
    private val analytics: AnalyticsDriver,
    private val platform: String,
) : ViewModel() {
    val state: StateFlow<GateState> = gate.state
    val download: StateFlow<FlexibleDownload> = gate.download

    /** Update now is working (asking Play, opening the store): the button shows it, the screen stays. */
    val busy: StateFlow<Boolean> = gate.busy

    /** This build, for "You have version 1.0.2 (4)". */
    val build: Int get() = gate.build

    /** Account's "Update available" row (FR-021). */
    val available: StateFlow<Boolean> = gate.available

    /** False only in dev with no store page (FR-017): Update now is then not offered. */
    val updateOffered: StateFlow<Boolean> = gate.updateOffered

    init {
        gate.onLaunch()
        gate.takeUpdatedFrom()?.let { analytics.capture(AnalyticsEvent.AppUpdateCompleted(fromBuild = it, toBuild = gate.build)) }
        viewModelScope.launch {
            gate.state.collect { s -> // a StateFlow only emits changes
                levelOf(s)?.let { analytics.capture(AnalyticsEvent.AppUpdatePromptShown(it, platform, gate.build)) }
            }
        }
    }

    /** The app came back to the screen (FR-005/006). */
    fun onForeground() = gate.onForeground()

    fun updateNow() {
        analytics.capture(AnalyticsEvent.AppUpdateAction(levelOf(state.value) ?: "available", "update"))
        gate.updateNow()
    }

    fun later() {
        levelOf(state.value)?.let { analytics.capture(AnalyticsEvent.AppUpdateAction(it, "later")) }
        gate.later()
    }

    fun restart() {
        analytics.capture(AnalyticsEvent.AppUpdateAction("optional", "restart"))
        gate.restart()
    }

    /** "Call dispatch" on the mandatory screen; the screen dials through the map launcher. */
    fun chooseCallDispatch() = analytics.capture(AnalyticsEvent.AppUpdateAction("mandatory", "call_dispatch"))

    fun leaveApp() = gate.leaveApp()

    private fun levelOf(s: GateState): String? = when (s) {
        GateState.Mandatory -> "mandatory"
        GateState.Optional -> "optional"
        is GateState.Notice -> "notice"
        GateState.Checking, GateState.Passed -> null
    }
}
