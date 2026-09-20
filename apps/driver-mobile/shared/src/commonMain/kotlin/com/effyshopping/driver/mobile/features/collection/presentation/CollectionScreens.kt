package com.effyshopping.driver.mobile.features.collection.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.collection.domain.CollectionStop
import com.effyshopping.driver.mobile.features.collection.domain.PackageMethod
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import com.effyshopping.mobile.kit.ui.SwipeToConfirm

// ── Collection run (design screen `collection-run`) ─────────────────────────────────────────────

/**
 * The ordered round of shops (060 US1, design screen `collection-run`).
 *
 * ⚠ **A RECORDED CARD EXCEPTION** (Principle V, plan Complexity Tracking, research R12): each stop
 * block carries **its own action button**, and a list row with a primary action inside it is a card
 * however it is named. Calling it a row would be a naming dodge rather than a layout decision.
 *
 * ⚠ The design shows an ETA per stop. Omitted — there is no routing engine and no coordinates
 * (049 R13), and a driver sequences their round by exactly those numbers.
 */
@Composable
fun CollectionRunScreen(
    state: CollectionUiState,
    onBack: () -> Unit,
    onOpenStop: (String) -> Unit,
    onCheckIn: () -> Unit,
    onRefresh: () -> Unit = {},
    hubName: String? = null,
) {
    val run = state.run
    val done = run?.stops?.count { it.isDone } ?: 0
    val total = run?.stops?.size ?: 0

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenHeader(
            title = "Collection run",
            subtitle = if (run != null) "$done of $total shops collected" else null,
            onBack = onBack,
        )

        when {
            state.isLoading && run == null -> Centered { CircularProgressIndicator() }
            run == null -> Centered { Text(state.message ?: "Couldn't load the run.") }
            else -> {
                ProgressBar(fraction = if (total == 0) 0f else done.toFloat() / total)

                EffyPullToRefresh(onRefresh = { onRefresh() }, modifier = Modifier.weight(1f)) {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                            .padding(horizontal = 20.dp),
                    ) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Pull down to refresh",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(16.dp))

                        run.stops.forEach { stop ->
                            StopBlock(stop = stop, onOpen = { onOpenStop(stop.stopId) })
                            Spacer(Modifier.height(11.dp))
                        }

                        HubBlock(hubName)
                        Spacer(Modifier.height(20.dp))
                    }
                }

                state.message?.let { ErrorText(it) }

                Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                    Button(
                        onClick = onCheckIn,
                        enabled = run.allCollected && !state.isWorking,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                    ) {
                        Text(
                            if (run.allCollected) "Check in at hub" else "Collect every shop first",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

private val CollectionStop.isDone: Boolean
    get() = status == StopStatus.COLLECTED || status == StopStatus.SHORT

@Composable
private fun StopBlock(stop: CollectionStop, onOpen: () -> Unit) {
    val done = stop.isDone
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            1.5.dp,
            if (done) MaterialTheme.colorScheme.outlineVariant else MaterialTheme.colorScheme.onSurface,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                SequenceMark(stop.sequence, done)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        stop.shopName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stop.shopCode,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(9.dp))
                    Text(
                        "${stop.packageCount} package${if (stop.packageCount == 1) "" else "s"}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            if (done) {
                OutlinedButton(
                    onClick = onOpen,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                ) { Text("Collected ✓") }
            } else {
                Button(
                    onClick = onOpen,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                ) { Text("Open stop", fontWeight = FontWeight.SemiBold) }
            }
        }
    }
}

/**
 * A stop's place in the round.
 *
 * ⚠ Shows a tick when done rather than the number, so a driver scanning the list sees progress
 * without reading — and selection/completion is not carried by colour alone.
 */
@Composable
private fun SequenceMark(sequence: Int, done: Boolean) {
    Surface(
        shape = RoundedCornerShape(9.dp),
        color = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.size(28.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                if (done) "\u2713" else sequence.toString(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (done) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

/** The run's destination. Dashed, because it is where the stops end rather than one of them. */
@Composable
private fun HubBlock(hubName: String?) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(28.dp).clip(RoundedCornerShape(9.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "H",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    hubName ?: "Effy hub",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "Check in every package · ends the run",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ── Shop stop (design screen `shop-stop`) ───────────────────────────────────────────────────────

/**
 * The package manifest at one shop (060 US1, design screen `shop-stop`).
 *
 * ⚠ Two things changed from 049, and both are behavioural, not cosmetic:
 *  1. **Packages are ticked individually** (FR-019) with a running count. The manifest was
 *     read-only, so a driver loading eight parcels had no way to keep their place.
 *  2. **Completion is a SWIPE** (FR-018), not a tap. It commits a physical fact about goods.
 */
@Composable
fun ShopStopScreen(
    state: CollectionUiState,
    onBack: () -> Unit,
    onCollect: () -> Unit,
    onTogglePackage: (String) -> Unit,
    onOpenProblem: () -> Unit,
) {
    val stop = state.stop
    val confirmed = state.confirmedPackageIds
    val total = stop?.packages?.size ?: 0
    val done = stop?.status == StopStatus.COLLECTED || stop?.status == StopStatus.SHORT

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenHeader(
            title = stop?.shopName ?: "Shop stop",
            subtitle = if (stop != null) "${confirmed.size} of $total confirmed" else null,
            onBack = onBack,
        )

        when {
            state.isLoading && stop == null -> Centered { CircularProgressIndicator() }
            stop == null -> Centered { Text(state.message ?: "Couldn't load the stop.") }
            else -> {
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp),
                ) {
                    Text(
                        "Tick each package as you load it.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(18.dp))
                    SectionLabel("PACKAGES TO COLLECT")
                    Spacer(Modifier.height(10.dp))

                    stop.packages.forEach { pkg ->
                        PackageRow(
                            ref = pkg.ref,
                            line = "${pkg.destinationSuburb} · " +
                                "${pkg.items.sumOf { it.qty }} item${if (pkg.items.sumOf { it.qty } == 1) "" else "s"}",
                            method = pkg.method,
                            checked = pkg.ref in confirmed,
                            enabled = !done,
                            onToggle = { onTogglePackage(pkg.ref) },
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }

                    Spacer(Modifier.height(12.dp))
                    TextButton(
                        onClick = onOpenProblem,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    ) { Text("Report a missing or short package") }
                    Spacer(Modifier.height(20.dp))
                }

                state.message?.let { ErrorText(it) }

                Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                    if (done) {
                        OutlinedButton(
                            onClick = {},
                            enabled = false,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                        ) { Text("Collected ✓") }
                    } else {
                        // ⚠ The driver may swipe with packages unticked — the ticks are a memory
                        // aid, not a gate. Blocking the swipe on a full set would strand a driver
                        // whose stop genuinely came up short; that is what the problem report is
                        // for, and FR-021 says reporting must not block the rest of the stop.
                        SwipeToConfirm(
                            label = "Swipe to confirm collected",
                            onConfirm = onCollect,
                            enabled = !state.isWorking,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PackageRow(
    ref: String,
    line: String,
    method: PackageMethod,
    checked: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    val spoken = "$ref, $line, ${if (method == PackageMethod.SAME_DAY) "same day" else "standard"}, " +
        if (checked) "confirmed" else "not confirmed"
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onToggle)
            .heightIn(min = 48.dp)
            .padding(vertical = 14.dp)
            .clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TickBox(checked)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(ref, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(
                line,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(10.dp))
        MethodBadge(method)
    }
}

@Composable
private fun TickBox(checked: Boolean) {
    Surface(
        shape = RoundedCornerShape(4.dp),
        color = if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        border = if (checked) null else BorderStroke(1.5.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.size(24.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (checked) {
                Text(
                    "✓",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }
    }
}

@Composable
private fun MethodBadge(method: PackageMethod) {
    val sameDay = method == PackageMethod.SAME_DAY
    Surface(
        shape = RoundedCornerShape(5.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            1.dp,
            if (sameDay) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Text(
            if (sameDay) "SAME DAY" else "STANDARD",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = if (sameDay) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 5.dp),
        )
    }
}

// ── Hub check-in (design screens `hub-checkin`, `hub-checkin-empty`) ────────────────────────────

/** Hub check-in — the run's pivot (060 US1). Rebuilt in T037–T039. */
@Composable
fun HubCheckinScreen(
    state: CollectionUiState,
    onBack: () -> Unit,
    onCheckIn: () -> Unit,
    onDone: () -> Unit,
) {
    LaunchedEffect(Unit) { if (state.hubSplit == null) onCheckIn() }
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenHeader(title = "Hub check-in", subtitle = null, onBack = onBack)
        val split = state.hubSplit
        when {
            state.isWorking && split == null -> Centered { CircularProgressIndicator() }
            split == null -> Centered { Text(state.message ?: "Checking in…") }
            else -> {
                Column(
                    Modifier.weight(1f).padding(horizontal = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SplitRow("Scanned in", split.scannedTotal)
                    HorizontalDivider()
                    SplitRow("Same-day — load for delivery", split.sameDayCount)
                    SplitRow("Standard — handed to carrier", split.standardCount)
                    Text(
                        "Standard packages leave your run at the dock.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                    Button(
                        onClick = onDone,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                    ) {
                        Text(
                            if (split.sameDayCount > 0) {
                                "Start same-day delivery run"
                            } else {
                                "Done — nothing same-day"
                            },
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
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

// ── Shared chrome ───────────────────────────────────────────────────────────────────────────────

@Composable
internal fun ScreenHeader(title: String, subtitle: String?, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 18.dp, end = 20.dp, top = 4.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = RoundedCornerShape(11.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.size(48.dp).clickable(onClick = onBack),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("←", style = MaterialTheme.typography.titleMedium)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            subtitle?.let {
                Spacer(Modifier.height(5.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
internal fun ProgressBar(fraction: Float) {
    Box(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp).height(5.dp)
            .clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Box(
            Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight()
                .clip(CircleShape).background(MaterialTheme.colorScheme.primary),
        )
    }
}

@Composable
internal fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ErrorText(msg: String) {
    Text(
        msg,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
    )
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
