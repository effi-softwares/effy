package com.effyshopping.driver.mobile.features.collection.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.presentation.DriverActionBar
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverChoice
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverNumberCircle
import com.effyshopping.driver.mobile.core.presentation.DriverProgress
import com.effyshopping.driver.mobile.core.presentation.DriverRow
import com.effyshopping.driver.mobile.core.presentation.DriverSectionLabel
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.presentation.DriverSkeleton
import com.effyshopping.driver.mobile.core.presentation.DriverState
import com.effyshopping.driver.mobile.core.presentation.DriverStatus
import com.effyshopping.driver.mobile.core.presentation.DriverStatusPill
import com.effyshopping.driver.mobile.core.presentation.DriverSwipeToConfirm
import com.effyshopping.driver.mobile.core.presentation.DriverTextField
import com.effyshopping.driver.mobile.core.presentation.rememberIsOpen
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.features.collection.domain.CollectionPackage
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.CollectionStop
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus
import com.effyshopping.driver.mobile.features.manifest.presentation.ManifestList
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_check
import com.effyshopping.driver.mobile.resources.lucide_chevron_down
import com.effyshopping.driver.mobile.resources.lucide_chevron_up
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_clock
import com.effyshopping.driver.mobile.resources.lucide_ellipsis
import com.effyshopping.driver.mobile.resources.lucide_navigation
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_phone
import com.effyshopping.driver.mobile.resources.lucide_refresh_ccw
import com.effyshopping.driver.mobile.resources.lucide_snowflake
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_warehouse
import com.effyshopping.driver.mobile.resources.lucide_scan_line
import com.effyshopping.driver.mobile.core.scan.HandMethod
import com.effyshopping.driver.mobile.core.scan.HandedOver
import com.effyshopping.driver.mobile.core.scan.ScanContext
import com.effyshopping.driver.mobile.core.scan.ScanContexts
import com.effyshopping.driver.mobile.core.scan.ScanItem
import com.effyshopping.driver.mobile.core.scan.ScanPanel

private fun packages(n: Int) = if (n == 1) "1 package" else "$n packages"
private val StopStatus.done: Boolean get() = this == StopStatus.COLLECTED || this == StopStatus.SHORT

// ── Collection run ────────────────────────────────────────────────────────────────────────────────

/** A collection run (canvas `CollectionRun`): the shops in order, then the hub, and the next stop pinned. */
@Composable
fun CollectionRunScreen(
    state: CollectionUiState,
    hubName: String?,
    onBack: () -> Unit,
    onOpenStop: (String) -> Unit,
    onCheckIn: () -> Unit,
    onRefresh: () -> Unit,
) {
    val run = state.run
    val open = rememberIsOpen(run?.opening)
    val next = run?.stops?.filter { !it.status.done }?.minByOrNull { it.sequence }
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Collection run", backLabel = "Today", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            when {
                run == null && state.isLoading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DriverSkeleton(Modifier.fillMaxWidth(0.6f)); repeat(5) { DriverSkeleton(Modifier.fillMaxWidth(), height = 64.dp) }
                }
                run == null -> DriverState(
                    Res.drawable.lucide_circle_alert, "This run didn't load", "That's on us. Check your signal and try again.",
                    actionLabel = "Try again", onAction = onRefresh,
                )
                else -> RunBody(run, hubName, open, next?.stopId, onOpenStop, onCheckIn)
            }
        }
        if (run != null && open) {
            DriverActionBar {
                if (next != null) {
                    DriverButton("Open next stop · ${next.shopName}", onClick = { onOpenStop(next.stopId) }, modifier = Modifier.fillMaxWidth())
                } else if (run.allCollected) {
                    DriverButton("Check in at the hub", onClick = onCheckIn, icon = Res.drawable.lucide_warehouse, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun RunBody(run: CollectionRun, hubName: String?, open: Boolean, nextId: String?, onOpenStop: (String) -> Unit, onCheckIn: () -> Unit) {
    val collected = run.stops.filter { it.status.done }
    val inVan = collected.sumOf { it.packageCount }
    val toLoad = run.stops.filter { !it.status.done }.sumOf { it.packageCount }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            listOfNotNull(hubName?.takeIf { it.isNotBlank() }?.let { "Ends at $it" }, run.dueLabel?.let { "finish by $it" }).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        DriverProgress(if (run.stops.isEmpty()) 0f else collected.size.toFloat() / run.stops.size)
        Text(
            "${collected.size} of ${run.stops.size} shops collected · ${packages(inVan)} in the van" + if (toLoad > 0) " · $toLoad still to load" else "",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    val opening = run.opening
    if (!open && opening != null) {
        DriverAlert(DriverAlertKind.Info, Res.drawable.lucide_clock, title = opening.sentence, description = "Look through the run now. Collecting unlocks when it opens.")
    }
    Column {
        DriverSectionLabel("Stops, in order")
        DriverGroup {
            run.stops.sortedBy { it.sequence }.forEach { s -> StopRow(s, isNext = s.stopId == nextId, onClick = { onOpenStop(s.stopId) }) }
            DriverRow(
                title = hubName?.takeIf { it.isNotBlank() } ?: "The hub",
                meta = "Check in every package · ends the run",
                last = true,
                onClick = if (run.allCollected && open) onCheckIn else null,
                leading = {
                    Box(Modifier.size(32.dp).clip(CircleShape).background(EffyRoles.primaryMuted), contentAlignment = Alignment.Center) {
                        DriverIcon(Res.drawable.lucide_warehouse, size = 16.dp, tint = MaterialTheme.colorScheme.primary)
                    }
                },
                trailing = { DriverStatusPill(DriverStatus.Last) },
            )
        }
    }
    run.stops.filter { it.status == StopStatus.SHORT }.forEach { s ->
        DriverAlert(
            DriverAlertKind.Muted, Res.drawable.lucide_package,
            title = "Short at ${s.shopName}",
            description = "A package was left behind. Dispatch has been told — nothing else to do.",
        )
    }
}

@Composable
private fun StopRow(s: CollectionStop, isNext: Boolean, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val (fill, ink) = when {
        s.status.done -> EffyRoles.brandMuted to EffyRoles.brand
        isNext -> scheme.primary to scheme.onPrimary
        else -> scheme.surfaceVariant to scheme.onSurface
    }
    DriverRow(
        title = s.shopName,
        meta = listOfNotNull(s.address, packages(s.packageCount)).joinToString(" · "),
        onClick = onClick,
        leading = { DriverNumberCircle(s.sequence, fill, ink) },
        trailing = {
            DriverStatusPill(
                when {
                    s.status == StopStatus.COLLECTED -> DriverStatus.Collected
                    s.status == StopStatus.SHORT -> DriverStatus.Short
                    isNext -> DriverStatus.Next
                    else -> DriverStatus.ToCollect
                },
            )
        },
    )
}

// ── Shop stop ─────────────────────────────────────────────────────────────────────────────────────

/** The three things that can be wrong with a package at a shop (canvas `ShopStop-Report`). */
private enum class Problem(val label: String, val hint: String) {
    Missing("Missing", "The shop can't find it"),
    Damaged("Damaged", "Torn, leaking or crushed — don't take it"),
    NotReady("Not ready", "Still being packed"),
}

/**
 * One shop (canvas `ShopStop`): tick each package as it goes in the van, report any that are not, and
 * swipe to collect. ⚠ Nothing is sent until the swipe — ticks and reports are kept on the phone.
 */
@Composable
fun ShopStopScreen(
    state: CollectionUiState,
    position: Int?,
    stopCount: Int,
    onBack: () -> Unit,
    onCollect: () -> Unit,
    onScanCollect: (Map<String, HandMethod>) -> Unit,
    onTogglePackage: (String) -> Unit,
    onReport: (key: String, kind: String, note: String?) -> Unit,
    onWithdrawReport: (String) -> Unit,
    onRetry: () -> Unit,
    onNavigate: (String) -> Unit,
    onCallDispatch: (() -> Unit)?,
) {
    val stop = state.stop
    val title = if (position != null && stopCount > 0) "Stop $position of $stopCount" else "Shop stop"
    if (stop == null) {
        Column(Modifier.fillMaxSize()) {
            DriverInlineBar(title, backLabel = "Run", onBack = onBack)
            Column(Modifier.padding(DriverSize.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (state.isLoading) {
                    DriverSkeleton(Modifier.fillMaxWidth(0.7f), height = 32.dp); repeat(3) { DriverSkeleton(Modifier.fillMaxWidth(), height = 72.dp) }
                } else {
                    DriverState(Res.drawable.lucide_circle_alert, "This stop didn't load", state.message ?: "That's on us. Check your signal and try again.", actionLabel = "Try again", onAction = onRetry)
                }
            }
        }
        return
    }
    var scanning by rememberSaveable(stop.stopId) { mutableStateOf(false) }
    val run = state.run
    if (scanning) {
        val live = stop.packages.filter { it.key !in state.reportedPackages && it.packageCode != null }
        val base = if (run != null) ScanContexts.shopStop(run, stop) else ScanContext(emptySet())
        ScanPanel(
            title = stop.shopName,
            backLabel = "Stop",
            context = ScanContext(expected = live.mapNotNull { it.packageCode }.toSet(), elsewhere = base.elsewhere),
            items = live.map { ScanItem(it.packageCode!!, it.ref, meta = "to ${it.destinationSuburb}", hint = coverage(it)) },
            completeLabel = "Collecting the stop",
            working = state.isWorking,
            message = state.message,
            onBack = { scanning = false },
            onComplete = { handed -> onScanCollect(handed.associate { it.code to it.method }) },
        )
        return
    }
    var reporting by rememberSaveable(stop.stopId) { mutableStateOf<String?>(null) }
    var checking by rememberSaveable(stop.stopId) { mutableStateOf(false) }
    var swipeKey by rememberSaveable(stop.stopId) { mutableIntStateOf(0) }
    val open = rememberIsOpen(stop.opening)
    val ticked = stop.packages.count { it.key in state.confirmedPackageIds }
    val reported = stop.packages.count { it.key in state.reportedPackages }
    val unticked = stop.packages.filter { it.key !in state.confirmedPackageIds && it.key !in state.reportedPackages }
    val alreadyCollected = stop.status.done

    Column(Modifier.fillMaxSize()) {
        DriverInlineBar(title, backLabel = "Run", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            if (stop.stale) Text("Last loaded copy — changes since then won't show.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(stop.shopName, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold)
                stop.address?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                stop.address?.let { address ->
                    DriverButton("Navigate", onClick = { onNavigate(address) }, style = DriverButtonStyle.Outline, icon = Res.drawable.lucide_navigation, tall = false, modifier = Modifier.weight(1f))
                }
                if (onCallDispatch != null) {
                    DriverButton("Dispatch", onClick = onCallDispatch, style = DriverButtonStyle.Outline, icon = Res.drawable.lucide_phone, tall = false, modifier = Modifier.weight(1f))
                }
            }
            val opening = stop.opening
            if (!open && opening != null) {
                DriverAlert(DriverAlertKind.Info, Res.drawable.lucide_clock, title = opening.sentence, description = "Look through the stop now. Collecting unlocks when it opens.")
            }
            if (open && !alreadyCollected && stop.packages.any { it.packageCode != null }) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    DriverButton("Scan packages", onClick = { scanning = true }, icon = Res.drawable.lucide_scan_line, modifier = Modifier.fillMaxWidth())
                    Text("Scanning the last one collects the stop. Or tick by hand below and swipe.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (alreadyCollected) {
                DriverAlert(DriverAlertKind.Muted, Res.drawable.lucide_check, title = if (stop.status == StopStatus.SHORT) "Collected, short" else "Collected", description = "This stop is done.")
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(packages(stop.packages.size), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.weight(1f))
                    if (!alreadyCollected) Text("Tick each as it goes in the van", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                DriverGroup {
                    stop.packages.forEachIndexed { i, p ->
                        PackageRow(
                            p,
                            ticked = p.key in state.confirmedPackageIds,
                            problem = state.reportedPackages[p.key]?.kind,
                            enabled = open && !alreadyCollected,
                            last = i == stop.packages.lastIndex,
                            onToggle = { onTogglePackage(p.key) },
                            onReport = { reporting = p.key },
                            onUndo = { onWithdrawReport(p.key) },
                        )
                    }
                }
                if (!alreadyCollected) {
                    Text(
                        "Tap a package's ••• to report it missing, damaged or not ready. Nothing is sent until you swipe.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (!alreadyCollected) {
            DriverActionBar {
                key(swipeKey) {
                    DriverSwipeToConfirm(
                        "Swipe to confirm collected",
                        enabled = open && !state.isWorking,
                        note = buildList {
                            add("$ticked ticked")
                            if (reported > 0) add("$reported reported")
                            if (unticked.isNotEmpty()) add("${unticked.size} not ticked yet")
                        }.joinToString(" · "),
                        onConfirm = { if (unticked.isEmpty()) onCollect() else checking = true },
                    )
                }
            }
        }
    }

    reporting?.let { key ->
        stop.packages.firstOrNull { it.key == key }?.let { p ->
            ReportSheet(p, onDismiss = { reporting = null }, onLeave = { kind, note -> onReport(key, kind, note); reporting = null })
        }
    }
    if (checking) {
        val first = unticked.firstOrNull()
        if (first == null) {
            androidx.compose.runtime.LaunchedEffect(Unit) { checking = false }
        } else {
            DriverSheet(
                title = if (unticked.size == 1) "1 package isn't ticked" else "${unticked.size} packages aren't ticked",
                description = "${first.ref} · ${coverage(first)} · to ${first.destinationSuburb}. Is it in the van?",
                onDismiss = { checking = false; swipeKey++ },
            ) {
                DriverButton(if (unticked.size == 1) "Yes, it's in the van — collect" else "Yes, they're all in the van — collect", onClick = { checking = false; onCollect() }, modifier = Modifier.fillMaxWidth())
                DriverButton("No — report a problem", onClick = { checking = false; swipeKey++; reporting = first.key }, style = DriverButtonStyle.Outline, modifier = Modifier.fillMaxWidth())
                DriverButton("Go back and check", onClick = { checking = false; swipeKey++ }, style = DriverButtonStyle.Ghost, tall = false, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

/** Who takes the package from the hub, in the driver's two words (082): "Effy · window" or "Courier". */
private fun coverage(p: CollectionPackage): String =
    if (p.goesToCourier) "Courier" else listOfNotNull("Effy", p.windowLabel).joinToString(" · ")

@Composable
private fun PackageRow(
    p: CollectionPackage,
    ticked: Boolean,
    problem: String?,
    enabled: Boolean,
    last: Boolean,
    onToggle: () -> Unit,
    onReport: () -> Unit,
    onUndo: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    var open by rememberSaveable(p.key) { mutableStateOf(false) }
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled && problem == null, role = Role.Checkbox, onClick = onToggle)
                .semantics { stateDescription = if (problem != null) "Reported" else if (ticked) "Ticked" else "Not ticked" }
                .heightIn(min = DriverSize.rowTall)
                .padding(start = 16.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(26.dp)
                    .clip(EffyStorefrontShape.small)
                    .background(if (ticked) EffyRoles.brand else if (problem != null) scheme.surfaceVariant else scheme.background)
                    .border(2.dp, if (ticked) EffyRoles.brand else scheme.outline, EffyStorefrontShape.small),
                contentAlignment = Alignment.Center,
            ) {
                if (ticked) DriverIcon(Res.drawable.lucide_check, size = 16.dp, tint = EffyRoles.brandForeground)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        p.ref,
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                        textDecoration = if (problem != null) TextDecoration.LineThrough else null,
                        color = if (problem != null) scheme.onSurfaceVariant else scheme.onSurface,
                    )
                    if (p.summary.hasCold) {
                        Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
                            DriverIcon(Res.drawable.lucide_snowflake, size = 12.dp)
                            Text("Cold", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    DriverIcon(if (p.goesToCourier) Res.drawable.lucide_package else Res.drawable.lucide_truck, size = 12.dp, tint = scheme.onSurfaceVariant)
                    Text(coverage(p), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                }
                Row(
                    Modifier.clickable(enabled = p.items.isNotEmpty(), role = Role.Button) { open = !open },
                    horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "To ${p.destinationSuburb} · ${if (p.items.size == 1) "1 item" else "${p.items.size} items"}",
                        style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
                    )
                    if (p.items.isNotEmpty()) DriverIcon(if (open) Res.drawable.lucide_chevron_up else Res.drawable.lucide_chevron_down, size = 12.dp, tint = scheme.onSurfaceVariant)
                }
                if (problem != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("$problem — leaving at shop", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold))
                        if (enabled) {
                            Text(
                                "Undo",
                                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                                color = scheme.primary,
                                modifier = Modifier.clickable(role = Role.Button, onClick = onUndo).padding(horizontal = 6.dp, vertical = 8.dp),
                            )
                        }
                    }
                }
            }
            if (enabled && p.packageId != null) {
                Box(
                    Modifier.size(DriverSize.target).clip(CircleShape).clickable(role = Role.Button, onClick = onReport)
                        .semantics { contentDescription = "Report a problem with ${p.ref}" },
                    contentAlignment = Alignment.Center,
                ) { DriverIcon(Res.drawable.lucide_ellipsis, tint = scheme.onSurfaceVariant) }
            }
        }
        if (open) ManifestList(p.items, Modifier.padding(start = 54.dp, end = 16.dp, bottom = 8.dp))
        if (!last) HorizontalDivider(color = scheme.outlineVariant)
    }
}

@Composable
private fun ReportSheet(p: CollectionPackage, onDismiss: () -> Unit, onLeave: (kind: String, note: String?) -> Unit) {
    var problem by rememberSaveable(p.key) { mutableStateOf(Problem.Missing) }
    var note by rememberSaveable(p.key) { mutableStateOf("") }
    DriverSheet(
        title = "Report a problem",
        description = "${p.ref} · to ${p.destinationSuburb} · ${if (p.items.size == 1) "1 item" else "${p.items.size} items"}",
        onDismiss = onDismiss,
    ) {
        Text("What's wrong?", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
        Problem.entries.forEach { r -> DriverChoice(r.label, problem == r, { problem = r }, body = r.hint) }
        DriverTextField(note, { note = it }, label = "Note for dispatch (optional)", placeholder = "What did the shop say?", lines = 2)
        DriverButton("Leave it at the shop", onClick = { onLeave(problem.label, note.trim().ifBlank { null }) }, style = DriverButtonStyle.Problem, modifier = Modifier.fillMaxWidth())
        Text("Sent with the stop when you swipe to confirm.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ── Hub check-in ──────────────────────────────────────────────────────────────────────────────────

/** Hub check-in (canvas `HubCheckin`, `-Done`, `-Offline`): what is in the van, then where each lot goes. */
@Composable
fun HubCheckinScreen(
    state: CollectionUiState,
    hubName: String?,
    onBack: () -> Unit,
    onCheckIn: (List<HandedOver>) -> Unit,
    onDone: () -> Unit,
    /** 092 — the driver's next delivery run, as Today holds it: (title, detail); null when there is none. */
    nextRun: Pair<String, String>? = null,
) {
    val split = state.hubSplit
    var scanning by rememberSaveable { mutableStateOf(false) }
    val run = state.run
    if (scanning && run != null && split == null && !state.checkInSending) {
        val sort = run.hubSort.associateBy { it.packageCode }
        ScanPanel(
            title = "Hub check-in",
            backLabel = "Hub",
            context = ScanContexts.hub(run),
            // Grouped as the hub is: load now, then shelve, then the courier bay.
            items = run.stops.filter { it.status.done }
                .flatMap { s -> s.packageCodes.map { c -> ScanItem(c, "From ${s.shopName}", hint = sort[c]?.label) } }
                .sortedBy { sort[it.code]?.kind?.ordinal ?: Int.MAX_VALUE },
            completeLabel = "Checking everything in",
            working = state.isWorking,
            message = state.message,
            onBack = { scanning = false },
            onComplete = { handed -> scanning = false; onCheckIn(handed) },
        )
        return
    }
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Hub check-in", backLabel = "Run", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            when {
                split != null -> CheckedIn(split, nextRun)
                state.checkInSending -> Sending()
                else -> {
                    Confirm(state.run, hubName)
                    if (run != null && run.stops.any { it.packageCodes.isNotEmpty() }) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            DriverButton("Scan packages off the van", onClick = { scanning = true }, icon = Res.drawable.lucide_scan_line, modifier = Modifier.fillMaxWidth())
                            Text("Each scan tells you where it goes — load now, shelve, or the courier bay. The last scan checks everything in.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        DriverActionBar {
            if (split != null || state.checkInSending) {
                DriverButton("Back to Today", onClick = onDone, modifier = Modifier.fillMaxWidth())
            } else {
                DriverSwipeToConfirm("Swipe to check in without scanning", onConfirm = { onCheckIn(emptyList()) }, enabled = !state.isWorking, note = "Use only if the labels won't scan")
            }
        }
    }
}

@Composable
private fun Confirm(run: CollectionRun?, hubName: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(hubName?.takeIf { it.isNotBlank() } ?: "The hub", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text(
            listOfNotNull("Last stop on this run", run?.dueLabel?.let { "finish by $it" }).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    val collected = run?.stops?.filter { it.status.done }.orEmpty()
    if (collected.isNotEmpty()) {
        Column {
            DriverSectionLabel("${packages(collected.sumOf { it.packageCount })} from ${if (collected.size == 1) "1 shop" else "${collected.size} shops"}")
            DriverGroup {
                collected.forEachIndexed { i, s ->
                    DriverRow(
                        s.shopName,
                        last = i == collected.lastIndex,
                        trailing = {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (s.status == StopStatus.SHORT) DriverStatusPill(DriverStatus.Short)
                                Text("${s.packageCount}", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
                            }
                        },
                    )
                }
            }
        }
        if (collected.any { it.status == StopStatus.SHORT }) {
            DriverAlert(DriverAlertKind.Muted, Res.drawable.lucide_package, title = "Some packages were left at the shop", description = "They aren't in the van and aren't checked in.")
        }
    }
}

@Composable
private fun CheckedIn(split: HubSplit, nextRun: Pair<String, String>?) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Collection run done", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = EffyRoles.brand)
        Text("${packages(split.scannedTotal)} checked in", fontSize = 28.sp, fontWeight = FontWeight.Bold)
    }
    if (split.effy.isNotEmpty()) {
        Column {
            DriverSectionLabel("Effy delivers · ${split.effyCount}")
            DriverGroup {
                split.effy.forEachIndexed { i, g ->
                    DriverRow(
                        g.label,
                        meta = if (g.dueToday) "Goes out today" else "A later day",
                        last = i == split.effy.lastIndex,
                        trailing = { SortTag(if (g.dueToday) "Load now" else "Shelve", strong = g.dueToday, count = g.count) },
                    )
                }
            }
        }
    }
    if (split.toCourier > 0) {
        Column {
            DriverSectionLabel("Courier · ${split.toCourier}")
            DriverGroup {
                DriverRow(
                    "Courier parcels",
                    meta = split.nextCourierPickupLabel?.let { "Next courier pickup $it" },
                    last = true,
                    trailing = { SortTag("Courier bay", strong = false, count = split.toCourier) },
                )
            }
        }
    }
    if (nextRun != null) {
        DriverAlert(DriverAlertKind.Info, Res.drawable.lucide_truck, title = nextRun.first, description = nextRun.second)
    } else {
        DriverAlert(DriverAlertKind.Muted, Res.drawable.lucide_truck, title = "Nothing else assigned yet", description = "Your next run appears on Today by itself when it's assigned.")
    }
}

@Composable
private fun SortTag(word: String, strong: Boolean, count: Int) {
    val scheme = MaterialTheme.colorScheme
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("$count", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
        Text(
            word,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = if (strong) scheme.onPrimary else scheme.onSurface,
            modifier = Modifier.clip(CircleShape).background(if (strong) scheme.primary else scheme.surfaceVariant).padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun Sending() {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Saved on this phone", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = MaterialTheme.colorScheme.primary)
        Text("Checked in — sending", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text(
            "You're offline. Your check-in sends as soon as there's signal. Where each parcel goes will show then — hand them all to the hub team now.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    DriverAlert(DriverAlertKind.Info, Res.drawable.lucide_refresh_ccw, title = "No need to wait here", description = "You can close the app. If the hub's Wi-Fi is available, connect to it to send now.")
}
