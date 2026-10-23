package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.localTimeText
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_pause
import com.effyshopping.driver.mobile.resources.lucide_refresh_ccw
import com.effyshopping.driver.mobile.resources.lucide_wifi_off
import kotlinx.coroutines.delay

/** The connection banners, in the one order they stack (the canvas's Patterns). */
enum class DriverBanner { Offline, Waiting, Refused, LivePaused }

/**
 * Which banners show, top to bottom: offline first (it explains the others), then what is waiting to
 * send, then what was refused, then live updates paused — which says nothing new while offline, so it
 * is left out then.
 */
fun driverBanners(offline: Boolean, waiting: Int, refused: Int, livePaused: Boolean): List<DriverBanner> = buildList {
    if (offline) add(DriverBanner.Offline)
    if (waiting > 0) add(DriverBanner.Waiting)
    if (refused > 0) add(DriverBanner.Refused)
    if (livePaused && !offline) add(DriverBanner.LivePaused)
}

/** What the banners need to say. Labels are the queue's own ("Collected Fitzroy store"). */
data class DriverBannerState(
    val offline: Boolean = false,
    /** When the copy on screen was last read; null when not known. */
    val syncedAtEpochMillis: Long? = null,
    val waitingLabels: List<String> = emptyList(),
    /** Proofs waiting to upload — counted with the waiting updates. */
    val waitingProofs: Int = 0,
    val refusedLabels: List<String> = emptyList(),
    /** The live channel has been down for a few seconds. */
    val livePaused: Boolean = false,
)

/**
 * The stacked connection banners. They push the content down, never cover it. Draws nothing when all
 * is well.
 */
@Composable
fun DriverBanners(
    state: DriverBannerState,
    onRefresh: () -> Unit,
    onClearRefused: () -> Unit,
    onCallDispatch: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val waiting = state.waitingLabels.size + state.waitingProofs
    val shown = driverBanners(state.offline, waiting, state.refusedLabels.size, state.livePaused)
    if (shown.isEmpty()) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        shown.forEach { banner ->
            when (banner) {
                DriverBanner.Offline -> DriverAlert(
                    DriverAlertKind.Muted, Res.drawable.lucide_wifi_off,
                    title = "You're offline",
                    description = (state.syncedAtEpochMillis?.let { "Showing what loaded at ${localTimeText(it, withDay = false)}. " } ?: "") +
                        "Keep working — what you do is saved on this phone.",
                )
                DriverBanner.Waiting -> DriverAlert(
                    DriverAlertKind.Info, Res.drawable.lucide_refresh_ccw,
                    title = if (waiting == 1) "1 update waiting to send" else "$waiting updates waiting to send",
                    description = listOfNotNull(
                        state.waitingLabels.distinct().takeIf { it.isNotEmpty() }?.joinToString(" · "),
                        if (waiting == 1) "It sends as soon as you're back online." else "They send as soon as you're back online.",
                    ).joinToString(". "),
                )
                DriverBanner.Refused -> DriverAlert(
                    DriverAlertKind.Problem, Res.drawable.lucide_circle_alert,
                    title = "Not recorded: ${state.refusedLabels.distinct().joinToString(", ")}",
                    description = "It was saved while you were offline and has since been refused — the work may have moved to " +
                        "another driver. Check the packages and call dispatch.",
                    actions = {
                        if (onCallDispatch != null) {
                            DriverButton("Call dispatch", onClick = onCallDispatch, style = DriverButtonStyle.Outline, tall = false)
                        }
                        DriverButton("OK", onClick = onClearRefused, style = DriverButtonStyle.Ghost, tall = false)
                    },
                )
                DriverBanner.LivePaused -> DriverAlert(
                    DriverAlertKind.Muted, Res.drawable.lucide_pause,
                    title = "Live updates paused",
                    description = "Changes from dispatch may not show until you refresh.",
                    actions = { DriverButton("Refresh", onClick = onRefresh, style = DriverButtonStyle.Outline, tall = false) },
                )
            }
        }
    }
}

/**
 * Whether the live channel has been down long enough to say so — a few seconds, because every launch
 * and every brief blip passes through "reconnecting".
 */
@Composable
fun rememberLivePaused(live: Boolean): Boolean {
    var paused by remember { mutableStateOf(false) }
    LaunchedEffect(live) {
        paused = false
        if (!live) {
            delay(4_000)
            paused = true
        }
    }
    return paused
}
