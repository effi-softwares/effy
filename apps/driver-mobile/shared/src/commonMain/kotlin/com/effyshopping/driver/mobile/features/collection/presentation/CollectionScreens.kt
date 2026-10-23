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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.map.RunMapView
import com.effyshopping.driver.mobile.core.map.runMapDescription
import com.effyshopping.driver.mobile.core.platform.localDateIso
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
import com.effyshopping.driver.mobile.core.presentation.dayText
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis
import com.effyshopping.driver.mobile.core.presentation.rememberIsOpen
import com.effyshopping.driver.mobile.core.scan.HandMethod
import com.effyshopping.driver.mobile.core.scan.HandedOver
import com.effyshopping.driver.mobile.core.scan.Unscanned
import com.effyshopping.driver.mobile.core.scan.Accounted
import com.effyshopping.driver.mobile.core.scan.MissingBag
import com.effyshopping.driver.mobile.core.scan.title
import com.effyshopping.driver.mobile.core.scan.AccountSheet
import com.effyshopping.driver.mobile.core.scan.RouteTone
import com.effyshopping.driver.mobile.core.scan.ScanContext
import com.effyshopping.driver.mobile.core.scan.ScanContexts
import com.effyshopping.driver.mobile.core.scan.ScanGroup
import com.effyshopping.driver.mobile.core.scan.ScanItem
import com.effyshopping.driver.mobile.core.scan.ScanPanel
import com.effyshopping.driver.mobile.core.scan.ScanSort
import com.effyshopping.driver.mobile.core.scan.ScanSwatch
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.design.effyMonoFontFamily
import com.effyshopping.driver.mobile.features.collection.domain.CollectionPackage
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.CollectionStop
import com.effyshopping.driver.mobile.features.collection.domain.HubSortKind
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus
import com.effyshopping.driver.mobile.features.manifest.presentation.ManifestBox
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_arrow_right
import com.effyshopping.driver.mobile.resources.lucide_check
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_clock
import com.effyshopping.driver.mobile.resources.lucide_ellipsis
import com.effyshopping.driver.mobile.resources.lucide_info
import com.effyshopping.driver.mobile.resources.lucide_navigation
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_phone
import com.effyshopping.driver.mobile.resources.lucide_refresh_ccw
import com.effyshopping.driver.mobile.resources.lucide_scan_line
import com.effyshopping.driver.mobile.resources.lucide_search_x
import com.effyshopping.driver.mobile.resources.lucide_snowflake
import com.effyshopping.driver.mobile.resources.lucide_store
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_warehouse

private fun packages(n: Int) = if (n == 1) "1 package" else "$n packages"
private val StopStatus.done: Boolean get() = this == StopStatus.COLLECTED || this == StopStatus.SHORT

/** "410 Sydney Rd" from "410 Sydney Rd, Brunswick VIC 3056". */
private fun street(address: String?): String? = address?.split(", ")?.firstOrNull()?.takeIf { it.isNotBlank() }

// ── Collection run ────────────────────────────────────────────────────────────────────────────────

/** A collection run (redesign `05 Collection run / 01`): its time, progress, map, stops and the next stop. */
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
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter).padding(top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            when {
                run == null && state.isLoading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DriverSkeleton(Modifier.fillMaxWidth(0.6f), height = 28.dp); DriverSkeleton(Modifier.fillMaxWidth(), height = 210.dp)
                    repeat(4) { DriverSkeleton(Modifier.fillMaxWidth(), height = 64.dp) }
                }
                run == null -> DriverState(
                    Res.drawable.lucide_circle_alert, "We couldn't load your run", "This is on us, not you. Try again, or call dispatch if it keeps happening.",
                    actionLabel = "Try again", onAction = onRefresh, actionIcon = Res.drawable.lucide_refresh_ccw,
                )
                else -> RunBody(run, hubName, open, next, onOpenStop, onCheckIn)
            }
        }
        if (run != null && open) {
            DriverActionBar {
                if (next != null) {
                    DriverButton("Open next stop · ${next.shopName}", onClick = { onOpenStop(next.stopId) }, trailingIcon = Res.drawable.lucide_arrow_right, modifier = Modifier.fillMaxWidth())
                } else if (run.allCollected) {
                    DriverButton("Check in at the hub", onClick = onCheckIn, icon = Res.drawable.lucide_warehouse, modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun RunBody(run: CollectionRun, hubName: String?, open: Boolean, next: CollectionStop?, onOpenStop: (String) -> Unit, onCheckIn: () -> Unit) {
    val collected = run.stops.filter { it.status.done }
    val inVan = collected.sumOf { it.packageCount }
    val toLoad = run.stops.filter { !it.status.done }.sumOf { it.packageCount }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            listOfNotNull(dayText(localDateIso(nowEpochMillis())), hubName?.takeIf { it.isNotBlank() }?.let { "ends at $it" }).joinToString(" · "),
            style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        run.dueLabel?.let { Text("Finish by $it", fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold) }
        DriverProgress(if (run.stops.isEmpty()) 0f else collected.size.toFloat() / run.stops.size, modifier = Modifier.padding(top = 4.dp))
        Text(
            buildAnnotatedString {
                bold("${collected.size}"); append(" of "); bold("${run.stops.size}"); append(" shops collected · ")
                bold("$inVan"); append(" packages in the van")
                if (toLoad > 0) { append(" · "); bold("$toLoad"); append(" still to load") }
            },
            style = MaterialTheme.typography.bodyLarge,
        )
    }
    val opening = run.opening
    if (!open && opening != null) {
        DriverAlert(DriverAlertKind.Info, Res.drawable.lucide_clock, title = "Opens at ${opening.label}", description = "Look through the run now. Collecting unlocks when it opens.")
    }
    run.map?.let { map ->
        RunMapView(map, seed = run.runId, description = runMapDescription("collection", hubName, map, next?.shopName))
    }
    Column {
        DriverSectionLabel("Stops, in order")
        DriverGroup {
            run.stops.sortedBy { it.sequence }.forEach { s -> StopRow(s, isNext = s.stopId == next?.stopId, onClick = { onOpenStop(s.stopId) }) }
            DriverRow(
                title = hubName?.takeIf { it.isNotBlank() } ?: "The hub",
                meta = "Check in every package · ends the run",
                last = true,
                onClick = if (run.allCollected && open) onCheckIn else null,
                leading = {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                        DriverIcon(Res.drawable.lucide_warehouse, size = 18.dp)
                    }
                },
                trailing = { DriverStatusPill(DriverStatus.ToCollect, label = "Last", showIcon = false) },
            )
        }
    }
    run.stops.filter { it.status == StopStatus.SHORT }.forEach { s ->
        DriverAlert(
            DriverAlertKind.Muted, Res.drawable.lucide_circle_alert,
            title = "Short at ${s.shopName}",
            description = "A package was left behind. Dispatch has been told — nothing else to do.",
        )
    }
}

private fun androidx.compose.ui.text.AnnotatedString.Builder.bold(s: String) = withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(s) }

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
        meta = listOfNotNull(street(s.address), packages(s.packageCount)).joinToString(" · "),
        onClick = onClick,
        leading = { DriverNumberCircle(s.sequence, fill, ink, size = 40.dp) },
        trailing = {
            DriverStatusPill(
                when {
                    s.status == StopStatus.COLLECTED -> DriverStatus.Collected
                    s.status == StopStatus.SHORT -> DriverStatus.Short
                    isNext -> DriverStatus.Next
                    else -> DriverStatus.ToCollect
                },
                showIcon = false,
            )
        },
    )
}

// ── Shop stop ─────────────────────────────────────────────────────────────────────────────────────

/** The three things that can be wrong with a package at a shop (redesign `03 Report a problem`). */
private enum class Problem(val label: String, val hint: String) {
    Missing("Missing", "The shop can't find it"),
    Damaged("Damaged", "Torn, leaking or crushed — don't take it"),
    NotReady("Not ready", "Still being packed"),
}

/** Who takes the package from the hub, in the driver's words (082): "Effy · window" or "Courier". */
private fun coverage(p: CollectionPackage): String =
    if (p.goesToCourier) "Courier" else listOfNotNull("Effy", p.windowLabel).joinToString(" · ")

/**
 * One shop (redesign `05 Collection run / 02 Shop stop`): scan the packages, or tick each as it goes in
 * the van, report any that are not, and swipe to collect. ⚠ Nothing is sent until the swipe (or the last
 * scan) — ticks and reports are kept on the phone.
 */
@Composable
fun ShopStopScreen(
    state: CollectionUiState,
    position: Int?,
    stopCount: Int,
    onBack: () -> Unit,
    onCollect: () -> Unit,
    /** 096 — how each bag was handed over, and the bags declared not at the shop. */
    onScanCollect: (Map<String, HandMethod>, List<MissingBag>) -> Unit,
    onTogglePackage: (String) -> Unit,
    onReport: (key: String, kind: String, note: String?) -> Unit,
    onWithdrawReport: (String) -> Unit,
    onRetry: () -> Unit,
    onNavigate: (String) -> Unit,
    onCallDispatch: (() -> Unit)?,
    startScanning: Boolean = false,
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
                    DriverState(Res.drawable.lucide_circle_alert, "This stop didn't load", state.message ?: "That's on us. Check your signal and try again.", actionLabel = "Try again", onAction = onRetry, actionIcon = Res.drawable.lucide_refresh_ccw)
                }
            }
        }
        return
    }
    val open = rememberIsOpen(stop.opening)
    val alreadyCollected = stop.status.done
    val canScan = open && !alreadyCollected && stop.packages.any { it.bags.isNotEmpty() }
    var scanning by rememberSaveable(stop.stopId) { mutableStateOf(startScanning && canScan) }
    var reporting by rememberSaveable(stop.stopId) { mutableStateOf<String?>(null) }
    val run = state.run
    // 096 — a bag not scanned is asked about: it's here (ticked by hand), or it wasn't at the shop.
    var accounting by remember(stop.stopId) { mutableStateOf<List<HandedOver>?>(null) }
    if (scanning) {
        val live = stop.packages.filter { it.key !in state.reportedPackages && it.bags.isNotEmpty() }
        val bags = live.flatMap { p -> p.bags.map { b -> p to b } }
        val base = if (run != null) ScanContexts.shopStop(run, stop) else ScanContext(emptySet())
        accounting?.let { scanned ->
            val done = scanned.map { it.code }.toSet()
            AccountSheet(
                title = "Is every bag here?",
                description = "Say what happened to each bag you didn't scan. A bag that isn't here is held, and dispatch is told.",
                unscanned = bags.filter { (_, b) -> b.code !in done }.map { (p, b) -> Unscanned(b.code, "${p.ref} · ${b.title()}", b.code) },
                hereLabel = "It's here",
                missingLabel = "Not at the shop",
                reasons = listOf("not_at_shop" to "Not at the shop", "damaged" to "Damaged", "wrong_temperature" to "Wrong temperature", "other" to "Other"),
                otherKey = "other",
                confirmLabel = "Collect",
                working = state.isWorking,
                onDismiss = { accounting = null },
                onConfirm = { answers ->
                    accounting = null
                    scanning = false
                    val methods = scanned.associate { it.code to it.method } +
                        answers.filterValues { it == Accounted.Here }.keys.associateWith { HandMethod.MANUAL }
                    val missing = answers.mapNotNull { (code, a) -> (a as? Accounted.Missing)?.let { MissingBag(code, it.reason ?: "not_at_shop", it.note) } }
                    onScanCollect(methods, missing)
                },
            )
        }
        ScanPanel(
            title = stop.shopName,
            backLabel = "Run",
            context = ScanContext(expected = bags.map { it.second.code }.toSet(), elsewhere = base.elsewhere, bags = base.bags),
            items = bags.map { (p, b) ->
                ScanItem(
                    b.code, "${p.ref} · ${b.title()}", mono = true,
                    meta = coverage(p), tone = if (p.goesToCourier) RouteTone.Courier else RouteTone.Effy,
                    bannerTitle = "${p.ref} · ${b.title()}", bannerSub = coverage(p),
                )
            },
            listTitle = { s, t -> "Bags · $s of $t scanned" },
            idleSub = "${stop.shopName} · ${bagsWord(bags.size)}",
            completeVerb = "collecting",
            working = state.isWorking,
            message = state.message,
            onBack = onBack,
            onComplete = { handed -> onScanCollect(handed.associate { it.code to it.method }, emptyList()) },
            fallbackLabel = "Can't scan? Tick by hand",
            onFallback = { scanning = false },
            onFallbackWith = { scanned -> accounting = scanned },
            secondaryLabel = "Report",
            onSecondary = { scanning = false },
        )
        return
    }
    var checking by rememberSaveable(stop.stopId) { mutableStateOf(false) }
    var swipeKey by rememberSaveable(stop.stopId) { mutableIntStateOf(0) }
    val ticked = stop.packages.count { it.key in state.confirmedPackageIds }
    val reported = stop.packages.count { it.key in state.reportedPackages }
    val unticked = stop.packages.filter { it.key !in state.confirmedPackageIds && it.key !in state.reportedPackages }

    Column(Modifier.fillMaxSize()) {
        DriverInlineBar(title, backLabel = "Run", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter).padding(top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            if (stop.stale) Text("Last loaded copy — changes since then won't show.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(stop.shopName, fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold)
                stop.address?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
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
                DriverAlert(DriverAlertKind.Info, Res.drawable.lucide_clock, title = "Opens at ${opening.label}", description = "Look through the stop now. Collecting unlocks when it opens.")
            }
            if (canScan) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    DriverButton("Scan packages", onClick = { scanning = true }, icon = Res.drawable.lucide_scan_line, modifier = Modifier.fillMaxWidth())
                    Text("Scanning the last one collects the stop. Or tick by hand below and swipe.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (alreadyCollected) {
                DriverAlert(DriverAlertKind.Muted, Res.drawable.lucide_check, title = if (stop.status == StopStatus.SHORT) "Collected, short" else "Collected", description = "This stop is done.")
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(packages(stop.packages.size), fontSize = 26.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    if (!alreadyCollected) Text("Tick each as it goes in the van", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                val shape = EffyStorefrontShape.banner
                Column(Modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)) {
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
                            if (reported > 0) add("$reported ${state.reportedPackages.values.firstOrNull()?.kind?.lowercase() ?: "reported"}")
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
            LaunchedEffect(Unit) { checking = false }
        } else {
            DriverSheet(
                title = if (unticked.size == 1) "1 package isn't ticked" else "${unticked.size} packages aren't ticked",
                description = "${first.ref} · ${coverage(first)} · to ${first.destinationSuburb}. Is it in the van?",
                icon = Res.drawable.lucide_package,
                onDismiss = { checking = false; swipeKey++ },
            ) {
                DriverButton(if (unticked.size == 1) "Yes, it's in the van — collect" else "Yes, they're all in the van — collect", onClick = { checking = false; onCollect() }, modifier = Modifier.fillMaxWidth())
                DriverButton("No — report a problem", onClick = { checking = false; swipeKey++; reporting = first.key }, style = DriverButtonStyle.Outline, modifier = Modifier.fillMaxWidth())
                DriverButton("Go back and check", onClick = { checking = false; swipeKey++ }, style = DriverButtonStyle.Ghost, tall = false, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

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
                .padding(start = 16.dp, end = 4.dp, top = 14.dp, bottom = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                Modifier
                    .padding(top = 2.dp)
                    .size(28.dp)
                    .clip(EffyStorefrontShape.small)
                    .background(if (ticked) EffyRoles.brand else if (problem != null) scheme.surfaceVariant else scheme.background)
                    .border(if (ticked) 0.dp else 1.5.dp, if (ticked) EffyRoles.brand else scheme.outline, EffyStorefrontShape.small),
                contentAlignment = Alignment.Center,
            ) {
                if (ticked) DriverIcon(Res.drawable.lucide_check, size = 18.dp, tint = EffyRoles.brandForeground)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        p.ref,
                        fontFamily = effyMonoFontFamily(), fontSize = 17.sp,
                        textDecoration = if (problem != null) TextDecoration.LineThrough else null,
                        color = if (problem != null) scheme.onSurfaceVariant else scheme.onSurface,
                    )
                    if (p.summary.hasCold) {
                        Row(
                            Modifier.clip(EffyStorefrontShape.control).background(scheme.surfaceVariant).padding(horizontal = 8.dp, vertical = 3.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically,
                        ) {
                            DriverIcon(Res.drawable.lucide_snowflake, size = 12.dp)
                            Text("Cold", fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                val routeTint = if (p.goesToCourier) scheme.primary else EffyRoles.brand
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    DriverIcon(if (p.goesToCourier) Res.drawable.lucide_package else Res.drawable.lucide_truck, size = 15.dp, tint = routeTint)
                    Text(coverage(p), style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium), color = routeTint)
                }
                Text(
                    listOfNotNull(
                        "To ${p.destinationSuburb}",
                        if (p.items.size == 1) "1 item" else "${p.items.size} items",
                        p.summary.let { s -> (s.frozen + s.chilled).takeIf { it > 0 }?.let { "$it cold" } },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant,
                    modifier = Modifier.clickable(enabled = p.items.isNotEmpty(), role = Role.Button) { open = !open },
                )
                if (problem != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Row(
                            Modifier.weight(1f, fill = false).clip(EffyStorefrontShape.control).background(scheme.onSurface).padding(horizontal = 8.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically,
                        ) {
                            DriverIcon(Res.drawable.lucide_circle_alert, size = 13.dp, tint = scheme.surface)
                            Text("$problem — leaving at shop", color = scheme.surface, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (enabled) {
                            Text(
                                "Undo", softWrap = false,
                                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                                color = scheme.primary, textDecoration = TextDecoration.Underline,
                                modifier = Modifier.clickable(role = Role.Button, onClick = onUndo).padding(vertical = 8.dp),
                            )
                        }
                    }
                }
                if (open) ManifestBox(p.items, Modifier.padding(top = 4.dp, end = 12.dp))
            }
            if (enabled && p.packageId != null) {
                Box(
                    Modifier.size(DriverSize.target).clip(CircleShape).clickable(role = Role.Button, onClick = onReport)
                        .semantics { contentDescription = "Report a problem with ${p.ref}" },
                    contentAlignment = Alignment.Center,
                ) { DriverIcon(Res.drawable.lucide_ellipsis, tint = scheme.onSurface) }
            }
        }
        if (!last) HorizontalDivider(color = scheme.outlineVariant)
    }
}

@Composable
private fun ReportSheet(p: CollectionPackage, onDismiss: () -> Unit, onLeave: (kind: String, note: String?) -> Unit) {
    var problem by rememberSaveable(p.key) { mutableStateOf(Problem.Missing) }
    var note by rememberSaveable(p.key) { mutableStateOf("") }
    DriverSheet(title = "Report a problem", onDismiss = onDismiss) {
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(fontFamily = effyMonoFontFamily(), color = MaterialTheme.colorScheme.onSurface)) { append(p.ref) }
                append(" · to ${p.destinationSuburb} · ${if (p.items.size == 1) "1 item" else "${p.items.size} items"}")
            },
            style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text("What's wrong?", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), modifier = Modifier.padding(top = 4.dp))
        Problem.entries.forEach { r ->
            DriverChoice(
                r.label, problem == r, { problem = r }, body = r.hint, iconTile = false,
                icon = when (r) {
                    Problem.Missing -> Res.drawable.lucide_search_x
                    Problem.Damaged -> Res.drawable.lucide_circle_alert
                    Problem.NotReady -> Res.drawable.lucide_clock
                },
            )
        }
        DriverTextField(note, { note = it }, label = "Note for dispatch (optional)", placeholder = "What did the shop say?", lines = 2)
        DriverButton("Leave it at the shop", onClick = { onLeave(problem.label, note.trim().ifBlank { null }) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        Text("Sent with the stop when you swipe to confirm.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

// ── Hub check-in ──────────────────────────────────────────────────────────────────────────────────

/** "LOAD NOW · Today, 4 pm – 6 pm" → ("LOAD NOW", "Today, 4 pm – 6 pm"). */
private fun splitSort(label: String): Pair<String, String?> {
    val parts = label.split(" · ", limit = 2)
    return parts[0] to parts.getOrNull(1)
}

private fun swatchOf(kind: HubSortKind) = when (kind) {
    HubSortKind.LOAD_NOW -> ScanSwatch.Blue
    HubSortKind.SHELVE -> ScanSwatch.Dark
    HubSortKind.COURIER_BAY, HubSortKind.UNKNOWN -> ScanSwatch.Outline
}

/**
 * Hub check-in (redesign `05 Hub check-in`, `06 Checked in`, `07 offline`, `09 S2`): what is in the van,
 * scanned off with where each goes; then where every lot goes.
 */
@Composable
fun HubCheckinScreen(
    state: CollectionUiState,
    hubName: String?,
    onBack: () -> Unit,
    /** What was handed over, and (093) the label codes of collected packages that are not in the van. */
    onCheckIn: (List<HandedOver>, List<MissingBag>) -> Unit,
    onDone: () -> Unit,
    onNavigate: (String) -> Unit,
    /** 092 — the driver's next delivery run, as Today holds it: (title, detail); null when there is none. */
    nextRun: Pair<String, String>? = null,
) {
    val split = state.hubSplit
    var scanning by rememberSaveable { mutableStateOf(false) }
    val run = state.run
    // 093 — checking in without scanning asks about every BAG not scanned; this is what WAS scanned.
    var accounting by remember { mutableStateOf<List<HandedOver>?>(null) }
    // 096 — each bag's hub instruction (its package's), and the bags that came off the shelves: a
    // package left at its shop has no instruction and is not coming.
    val sortByBag = run?.hubSort.orEmpty().flatMap { hs -> hs.bagCodes.ifEmpty { listOf(hs.packageCode) }.map { it to hs } }.toMap()
    fun comingBags(s: com.effyshopping.driver.mobile.features.collection.domain.CollectionStop) =
        s.bags.filter { b -> sortByBag.isEmpty() || b.code in sortByBag }
    if (run != null && split == null && !state.checkInSending) {
        accounting?.let { scanned ->
            val done = scanned.map { it.code }.toSet()
            val unscanned = run.stops.filter { it.status.done }.flatMap { s ->
                comingBags(s).filter { b -> b.code !in done }.map { b -> Unscanned(b.code, "From ${s.shopName} · ${b.title()}", b.code) }
            }
            if (unscanned.isEmpty()) {
                androidx.compose.runtime.LaunchedEffect(scanned) { accounting = null; onCheckIn(scanned, emptyList()) }
            } else {
                AccountSheet(
                    title = "Is every bag here?",
                    description = "Say what happened to each bag you didn't scan. One that isn't in the van is held, and dispatch is told.",
                    unscanned = unscanned,
                    hereLabel = "It's here",
                    missingLabel = "Not in the van",
                    reasons = emptyList(),
                    otherKey = null,
                    confirmLabel = "Check in",
                    working = state.isWorking,
                    onDismiss = { accounting = null },
                    onConfirm = { answers ->
                        accounting = null
                        val here = answers.filterValues { it == Accounted.Here }.keys.map { HandedOver(it, HandMethod.MANUAL) }
                        onCheckIn(scanned + here, answers.filterValues { it is Accounted.Missing }.keys.map { MissingBag(it, "not_in_van") })
                    },
                )
            }
        }
    }
    if (scanning && run != null && split == null && !state.checkInSending) {
        val sort = sortByBag
        val items = run.stops.filter { it.status.done }.flatMap { s ->
            comingBags(s).map { b ->
                val c = b.code
                val hs = sort[c]
                val (word, rest) = hs?.let { splitSort(it.label) } ?: ("CHECK IN" to null)
                ScanItem(
                    c, "From ${s.shopName} · ${b.title()}",
                    bannerTitle = "From ${s.shopName} · ${b.title()}", bannerSub = "Scanned off the van",
                    group = hs?.let { ScanGroup(it.label, word.lowercase().replaceFirstChar { ch -> ch.uppercase() }, rest, swatch = swatchOf(it.kind)) },
                    sort = hs?.let { ScanSort(word, rest ?: "", swatchOf(it.kind)) },
                )
            }
        }.sortedBy { sort[it.code]?.kind?.ordinal ?: Int.MAX_VALUE }
        ScanPanel(
            title = "Hub check-in",
            backLabel = "Run",
            context = ScanContexts.hub(run),
            items = items,
            listTitle = { s, t -> "$s of $t checked in" },
            idleSub = "${hubName?.takeIf { it.isNotBlank() } ?: "The hub"} · ${bagsWord(items.size)}",
            completeVerb = "checking in",
            working = state.isWorking,
            message = state.message,
            onBack = { scanning = false },
            onComplete = { handed -> scanning = false; onCheckIn(handed, emptyList()) },
            fallbackLabel = "Can't scan? Check in without scanning",
            onFallback = { scanning = false; accounting = emptyList() },
            onFallbackWith = { scanned -> scanning = false; accounting = scanned },
            grouped = items.any { it.group != null },
            listNote = "The last scan checks everything in and ends your collection run.",
        )
        return
    }
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Hub check-in", backLabel = "Run", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter).padding(top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            when {
                split != null -> {
                    if (split.held > 0) {
                        DriverAlert(
                            DriverAlertKind.Muted, Res.drawable.lucide_circle_alert,
                            title = "${if (split.held == 1) "1 package isn't" else "${split.held} packages aren't"} in the van",
                            description = "Dispatch has been told. Nothing else to do.",
                        )
                    }
                    CheckedIn(split, nextRun)
                }
                state.checkInSending -> Sending()
                else -> {
                    Confirm(run, hubName, onNavigate)
                    if (run != null && run.stops.any { it.bagCodes.isNotEmpty() }) {
                        DriverButton("Scan bags off the van", onClick = { scanning = true }, icon = Res.drawable.lucide_scan_line, modifier = Modifier.fillMaxWidth())
                        DriverAlert(
                            DriverAlertKind.Info, Res.drawable.lucide_info,
                            title = "Each scan tells you where it goes",
                            description = "Load now, shelve, or courier bay. The last scan checks everything in.",
                        )
                    }
                }
            }
        }
        DriverActionBar {
            if (split != null || state.checkInSending) {
                DriverButton("Back to Today", onClick = onDone, modifier = Modifier.fillMaxWidth())
            } else {
                val scannable = run?.stops?.any { it.bagCodes.isNotEmpty() } == true
                DriverSwipeToConfirm(
                    if (scannable) "Swipe to check in without scanning" else "Swipe to check in",
                    onConfirm = { if (scannable) accounting = emptyList() else onCheckIn(emptyList(), emptyList()) },
                    enabled = !state.isWorking,
                    note = if (scannable) "Fallback — use only if the labels won't scan" else "Hand every package to the hub team",
                )
            }
        }
    }
}

@Composable
private fun Confirm(run: CollectionRun?, hubName: String?, onNavigate: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(hubName?.takeIf { it.isNotBlank() } ?: "The hub", fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold)
        Text(
            listOfNotNull("Last stop on this run", run?.dueLabel?.let { "finish by $it" }).joinToString(" · "),
            style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    run?.map?.hub?.let { hub ->
        DriverButton("Navigate to the hub", onClick = { onNavigate("${hub.lat},${hub.lng}") }, style = DriverButtonStyle.Outline, icon = Res.drawable.lucide_navigation, tall = false, modifier = Modifier.fillMaxWidth())
    }
    val collected = run?.stops?.filter { it.status.done }.orEmpty()
    if (collected.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("${packages(collected.sumOf { it.packageCount })} in the van", fontSize = 26.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold)
            DriverGroup {
                collected.forEachIndexed { i, s ->
                    DriverRow(
                        s.shopName,
                        last = i == collected.lastIndex,
                        leading = { DriverIcon(Res.drawable.lucide_store, size = 20.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                        trailing = {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (s.status == StopStatus.SHORT) DriverStatusPill(DriverStatus.Short, showIcon = false)
                                Text("${s.packageCount}", fontSize = 18.sp)
                            }
                        },
                    )
                }
            }
            collected.filter { it.status == StopStatus.SHORT }.forEach { s ->
                Text("A package was left at ${s.shopName}. It isn't in the van and isn't counted.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun CheckedIn(split: HubSplit, nextRun: Pair<String, String>?) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(EffyRoles.brandMuted), contentAlignment = Alignment.Center) {
            DriverIcon(Res.drawable.lucide_check, size = 30.dp, tint = EffyRoles.brand)
        }
        Text("Collection run done", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = EffyRoles.brand)
        Text("${packages(split.scannedTotal)} checked in", fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold)
    }
    if (split.effy.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                DriverIcon(Res.drawable.lucide_truck, size = 16.dp, tint = EffyRoles.brand)
                Text("Effy delivers · ${split.effyCount}", color = EffyRoles.brand, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
            }
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
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                DriverIcon(Res.drawable.lucide_package, size = 16.dp, tint = MaterialTheme.colorScheme.primary)
                Text("Courier · ${split.toCourier}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
            }
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
        DriverAlert(DriverAlertKind.Muted, Res.drawable.lucide_clock, title = nextRun.first, description = nextRun.second)
    } else {
        DriverAlert(DriverAlertKind.Muted, Res.drawable.lucide_clock, title = "Nothing else assigned yet", description = "Your next run appears on Today by itself when it's assigned.")
    }
}

@Composable
private fun SortTag(word: String, strong: Boolean, count: Int) {
    val scheme = MaterialTheme.colorScheme
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("$count", fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Text(
            word,
            fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold,
            color = if (strong) scheme.onPrimary else scheme.onSurface,
            modifier = Modifier.clip(EffyStorefrontShape.control).background(if (strong) scheme.primary else scheme.surfaceVariant).padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun Sending() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(EffyRoles.primaryMuted), contentAlignment = Alignment.Center) {
            DriverIcon(Res.drawable.lucide_refresh_ccw, size = 28.dp, tint = MaterialTheme.colorScheme.primary)
        }
        Text("Saved on this phone", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = MaterialTheme.colorScheme.primary)
        Text("Checked in — sending", fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold)
        Text(
            "You're offline. Your check-in sends as soon as there's signal. Where each parcel goes will show then — hand them all to the hub team now.",
            style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    DriverAlert(DriverAlertKind.Info, Res.drawable.lucide_info, title = "No need to wait here", description = "You can close the app. If the hub's Wi-Fi is available, connect to it to send now.")
}

/** "1 bag" / "3 bags". */
internal fun bagsWord(n: Int): String = if (n == 1) "1 bag" else "$n bags"
