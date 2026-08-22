package com.effyshopping.driver.mobile.features.collection.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.collection.domain.PackageMethod
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus

/** Collection run overview — ordered shop stops (FR-013). */
@Composable
fun CollectionRunScreen(
    state: CollectionUiState,
    onBack: () -> Unit,
    onOpenStop: (String) -> Unit,
    onCheckIn: () -> Unit,
) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(20.dp)) {
        Header("Collection run", onBack)
        val run = state.run
        when {
            state.isLoading && run == null -> Centered { CircularProgressIndicator() }
            run == null -> Centered { Text(state.message ?: "Couldn't load the run.") }
            else -> {
                Text("${run.stops.count { it.status == StopStatus.COLLECTED || it.status == StopStatus.SHORT }} of ${run.stops.size} shops collected",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    run.stops.forEach { stop ->
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth().clickable { onOpenStop(stop.stopId) },
                        ) {
                            Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column {
                                    Text(stop.shopName, style = MaterialTheme.typography.titleMedium)
                                    Text("${stop.shopCode} · ${stop.packageCount} package(s)",
                                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(
                                    if (stop.status == StopStatus.COLLECTED || stop.status == StopStatus.SHORT) "✓" else "›",
                                    style = MaterialTheme.typography.titleLarge,
                                )
                            }
                        }
                    }
                }
                state.message?.let { ErrorText(it) }
                Button(
                    onClick = onCheckIn,
                    enabled = run.allCollected && !state.isWorking,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                ) { Text(if (run.allCollected) "Check in at hub" else "Collect every shop first", style = MaterialTheme.typography.titleMedium) }
            }
        }
    }
}

/** Shop stop — package manifest + collect (FR-014). */
@Composable
fun ShopStopScreen(
    state: CollectionUiState,
    onBack: () -> Unit,
    onCollect: () -> Unit,
    onReport: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(20.dp)) {
        val stop = state.stop
        Header(stop?.shopName ?: "Shop stop", onBack)
        when {
            state.isLoading && stop == null -> Centered { CircularProgressIndicator() }
            stop == null -> Centered { Text(state.message ?: "Couldn't load the stop.") }
            else -> {
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    stop.packages.forEach { pkg ->
                        Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(pkg.ref, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                    MethodBadge(pkg.method)
                                }
                                Text("→ ${pkg.destinationSuburb}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.height(6.dp))
                                pkg.items.forEach { line ->
                                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(line.name, style = MaterialTheme.typography.bodyMedium)
                                        Text("×${line.qty}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                    TextButton(onClick = { onReport("missing") }) { Text("Report a missing or short package") }
                }
                state.message?.let { ErrorText(it) }
                val done = stop.status == StopStatus.COLLECTED || stop.status == StopStatus.SHORT
                Button(
                    onClick = onCollect,
                    enabled = !done && !state.isWorking,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                ) { Text(if (done) "Collected ✓" else "Collect all — I have everything", style = MaterialTheme.typography.titleMedium) }
            }
        }
    }
}

/** Hub check-in — the same-day/standard split (FR-016). */
@Composable
fun HubCheckinScreen(
    state: CollectionUiState,
    onBack: () -> Unit,
    onCheckIn: () -> Unit,
    onDone: () -> Unit,
) {
    LaunchedEffect(Unit) { if (state.hubSplit == null) onCheckIn() }
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(20.dp)) {
        Header("Hub check-in", onBack)
        val split = state.hubSplit
        when {
            state.isWorking && split == null -> Centered { CircularProgressIndicator() }
            split == null -> Centered { Text(state.message ?: "Checking in…") }
            else -> {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SplitRow("Scanned in", split.scannedTotal)
                    HorizontalDivider()
                    SplitRow("Same-day — load for delivery", split.sameDayCount)
                    SplitRow("Standard — handed to carrier", split.standardCount)
                    Text("Standard packages leave your run at the dock.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Button(onClick = onDone, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(56.dp)) {
                    Text(if (split.sameDayCount > 0) "Start same-day delivery run" else "Done — nothing same-day", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}

@Composable
private fun SplitRow(label: String, count: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyLarge)
        Text("$count", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun MethodBadge(method: PackageMethod) {
    val label = if (method == PackageMethod.SAME_DAY) "SAME DAY" else "STANDARD"
    Surface(color = MaterialTheme.colorScheme.primary, shape = RoundedCornerShape(6.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimary,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
    }
}

@Composable
private fun Header(title: String, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onBack) { Text("‹ Back") }
        Spacer(Modifier.width(4.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ErrorText(msg: String) {
    Text(msg, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp))
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { content() }
}
