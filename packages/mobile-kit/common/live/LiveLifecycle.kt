package com.effyshopping.mobile.kit.live

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlinx.coroutines.delay

/**
 * Holds the live connection exactly while the app is in the foreground and signed in (071).
 *
 * Mount once, at the app root. Coming to the foreground connects — and connecting reads everything
 * once, which is how a phone that was in a pocket for an hour is current the moment it is looked
 * at (FR-013). Going to the background, or signing out, closes the connection: a backgrounded app
 * holds nothing open and costs nothing (FR-031).
 */
@Composable
fun LiveLifecycle(client: LiveClient, signedIn: Boolean) {
    var foreground by remember { mutableStateOf(true) }
    LifecycleEventEffect(Lifecycle.Event.ON_START) { foreground = true }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { foreground = false }

    DisposableEffect(client, signedIn, foreground) {
        if (signedIn && foreground) client.start() else client.stop()
        onDispose { }
    }
    DisposableEffect(client) { onDispose { client.stop() } }
}

/**
 * Says so when the screen cannot receive live updates (FR-015) — and nothing at all while it can.
 *
 * It waits a few seconds before appearing: every launch and every brief network blip passes
 * through "reconnecting", and a warning that flashes for each is a warning people learn to ignore.
 * `OFF` is shown too: on a staff app, a screen that has stopped updating must not look current.
 */
@Composable
fun LiveStatusLine(client: LiveClient, onRefresh: () -> Unit, modifier: Modifier = Modifier) {
    val state by client.state.collectAsState()
    var shown by remember { mutableStateOf(false) }
    // How long ago the screen was last known current — the moment the channel stopped being live.
    // ⚠ A CLOCK, NOT A REFRESH (FR-011): it re-words a time already held and reads nothing.
    var minutesStale by remember { mutableStateOf(0L) }

    LaunchedEffect(state) {
        shown = false
        minutesStale = 0
        if (state != LiveState.LIVE) {
            delay(APPEAR_AFTER_MS)
            shown = true
            while (true) {
                delay(60_000)
                minutesStale += 1
            }
        }
    }
    if (state == LiveState.LIVE || !shown) return

    val age = when (minutesStale) {
        0L -> "updated just now"
        1L -> "last updated 1 minute ago"
        else -> "last updated $minutesStale minutes ago"
    }

    Row(modifier = modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = (if (state == LiveState.RECONNECTING) "Reconnecting" else "Live updates are off") + " · $age",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onRefresh) { Text("Refresh") }
    }
}

private const val APPEAR_AFTER_MS = 4_000L
