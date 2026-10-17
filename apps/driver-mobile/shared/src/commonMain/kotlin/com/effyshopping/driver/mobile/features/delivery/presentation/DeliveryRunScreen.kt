package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.map.RunMapView
import com.effyshopping.driver.mobile.core.map.runMapDescription
import com.effyshopping.driver.mobile.core.presentation.DriverActionBar
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverNumberCircle
import com.effyshopping.driver.mobile.core.presentation.DriverProgress
import com.effyshopping.driver.mobile.core.presentation.DriverRow
import com.effyshopping.driver.mobile.core.presentation.DriverSectionLabel
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.presentation.DriverSkeleton
import com.effyshopping.driver.mobile.core.presentation.DriverState
import com.effyshopping.driver.mobile.core.presentation.DriverStatus
import com.effyshopping.driver.mobile.core.presentation.DriverStatusPill
import com.effyshopping.driver.mobile.core.presentation.DriverSwipeToConfirm
import com.effyshopping.driver.mobile.core.presentation.rememberIsOpen
import com.effyshopping.driver.mobile.core.presentation.timeText
import com.effyshopping.driver.mobile.core.scan.HandedOver
import com.effyshopping.driver.mobile.core.scan.ScanContexts
import com.effyshopping.driver.mobile.core.scan.ScanGroup
import com.effyshopping.driver.mobile.core.scan.ScanItem
import com.effyshopping.driver.mobile.core.scan.ScanPanel
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.design.effyMonoFontFamily
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.features.today.presentation.reasonWords
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_arrow_right
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_circle_check
import com.effyshopping.driver.mobile.resources.lucide_clock
import com.effyshopping.driver.mobile.resources.lucide_navigation
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_refresh_ccw
import com.effyshopping.driver.mobile.resources.lucide_scan_line
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_warehouse

internal fun proofWords(m: ProofMethod): String = when (m) {
    ProofMethod.PHOTO -> "photo"
    ProofMethod.SIGNATURE -> "signature"
    ProofMethod.CONTACTLESS -> "left safely"
}

/** The run's window in words, from its drops ("Today, 4 pm – 6 pm"); null when no drop was sold one. */
private fun runWindow(run: DeliveryRun): String? = run.drops.firstNotNullOfOrNull { it.window?.label }

/**
 * A delivery run (redesign `06 Delivery run / 01`): its window, progress, the van, the map and the drops
 * in order, with the next drop pinned at the bottom. Loading the van (S3) and the parcels coming back
 * open from here.
 */
@Composable
fun DeliveryRunScreen(
    state: DeliveryUiState,
    hubName: String?,
    onBack: () -> Unit,
    onOpenDrop: (String) -> Unit,
    onRefresh: () -> Unit,
    onLoadVan: (List<HandedOver>) -> Unit,
    onOpenReturn: (scan: Boolean) -> Unit,
) {
    val run = state.run
    val open = rememberIsOpen(run?.opening)
    val next = run?.drops?.filter { !it.status.isClosed }?.minByOrNull { it.sequence }
    val staged = run?.drops?.count { it.status == DropStatus.STAGED } ?: 0
    var loading by rememberSaveable { mutableStateOf(false) }
    if (run != null && loading && staged > 0) {
        val stagedDrops = run.drops.filter { it.status == DropStatus.STAGED }
        val window = runWindow(run)
        ScanPanel(
            title = "Load the van", backLabel = "Today",
            context = ScanContexts.load(run),
            // Load the last drops first, so drop 1 ends up nearest the door.
            items = stagedDrops.sortedByDescending { it.sequence }.flatMap { d ->
                d.packageCodes.mapIndexed { i, c ->
                    val street = d.street ?: d.customerSuburb
                    ScanItem(
                        c, "Package ${i + 1} of ${d.packageCodes.size}",
                        bannerTitle = "$street · package ${i + 1} of ${d.packageCodes.size}",
                        bannerSub = "Drop ${d.sequence}",
                        group = ScanGroup(d.dropId, street, d.customerSuburb.takeIf { d.street != null }, number = d.sequence),
                    )
                }
            },
            listTitle = { _, _ -> listOfNotNull("Delivery run", window).joinToString(" · ") },
            listSub = { s, t -> "$s of $t packages loaded · ${if (stagedDrops.size == 1) "1 drop" else "${stagedDrops.size} drops"}. Load the last drops first, so drop 1 ends up nearest the door." },
            idleSub = "${stagedDrops.sumOf { it.packageCodes.size }} packages · ${stagedDrops.size} drops",
            completeVerb = "starting the run",
            working = state.isWorking, message = state.message,
            onBack = { loading = false },
            onComplete = { handed -> loading = false; onLoadVan(handed) },
            fallbackLabel = "Can't scan? Mark all loaded",
            onFallback = { loading = false; onLoadVan(emptyList()) },
            grouped = true,
            listNote = "The last scan starts the run: every drop goes out for delivery and the customers are told you're on the way.",
        )
        return
    }
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Delivery run", backLabel = "Today", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter).padding(top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            when {
                run == null && state.isLoading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DriverSkeleton(Modifier.fillMaxWidth(0.6f), height = 28.dp); DriverSkeleton(Modifier.fillMaxWidth(), height = 210.dp)
                    repeat(5) { DriverSkeleton(Modifier.fillMaxWidth(), height = 64.dp) }
                }
                run == null -> DriverState(
                    Res.drawable.lucide_circle_alert, "We couldn't load your run", "This is on us, not you. Try again, or call dispatch if it keeps happening.",
                    actionLabel = "Try again", onAction = onRefresh, actionIcon = Res.drawable.lucide_refresh_ccw,
                )
                else -> RunBody(run, hubName, open, staged, next, state.isWorking, onOpenDrop, onScanLoad = { loading = true }, onLoadVan = { onLoadVan(emptyList()) }, onOpenReturn = onOpenReturn)
            }
        }
        if (run != null && next != null && open && staged == 0) {
            DriverActionBar {
                DriverButton(
                    "Open next drop · ${next.street ?: next.customerSuburb}",
                    onClick = { onOpenDrop(next.dropId) },
                    trailingIcon = Res.drawable.lucide_arrow_right,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun RunBody(
    run: DeliveryRun,
    hubName: String?,
    open: Boolean,
    staged: Int,
    next: DropSummary?,
    working: Boolean,
    onOpenDrop: (String) -> Unit,
    onScanLoad: () -> Unit,
    onLoadVan: () -> Unit,
    onOpenReturn: (Boolean) -> Unit,
) {
    val total = run.drops.size
    val delivered = run.drops.count { it.status == DropStatus.DELIVERED }
    val failed = run.drops.count { it.status == DropStatus.FAILED }
    val toGo = total - delivered - failed
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            listOfNotNull(hubName?.takeIf { it.isNotBlank() }?.let { "From $it" }, run.dueLabel?.let { "finish by $it" }).joinToString(" · "),
            style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(runWindow(run) ?: run.dueLabel?.let { "Finish by $it" } ?: "Delivery run", fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold)
        DriverProgress(if (total == 0) 0f else (delivered + failed).toFloat() / total, done = true, modifier = Modifier.padding(top = 4.dp))
    }
    val opening = run.opening
    when {
        !open && opening != null -> DriverAlert(
            DriverAlertKind.Info, Res.drawable.lucide_clock,
            title = "Opens at ${opening.label}",
            description = "Look through the run now. Loading and delivering unlock when it opens.",
        )
        staged > 0 -> {
            val codes = run.drops.any { it.status == DropStatus.STAGED && it.packageCodes.isNotEmpty() }
            DriverAlert(
                DriverAlertKind.Info, Res.drawable.lucide_truck,
                title = "Load the van",
                description = "${run.drops.filter { it.status == DropStatus.STAGED }.sumOf { it.packageCount }} packages for " +
                    "${if (staged == 1) "1 drop" else "$staged drops"}. Load the last drops first, so drop 1 ends up nearest the door.",
            )
            if (codes) DriverButton("Scan to load", onClick = onScanLoad, icon = Res.drawable.lucide_scan_line, modifier = Modifier.fillMaxWidth())
            DriverButton(
                if (codes) "Can't scan? Mark all loaded" else "Mark all loaded",
                onClick = onLoadVan, loading = working,
                style = if (codes) DriverButtonStyle.Outline else DriverButtonStyle.Primary,
                tall = !codes, modifier = Modifier.fillMaxWidth(),
            )
        }
        toGo > 0 -> VanLoaded(run.drops.sumOf { it.packageCount })
    }
    Text(
        buildAnnotatedString {
            bold("${delivered + failed}"); append(" of "); bold("$total"); append(" done")
            if (delivered > 0) { append(" · "); bold("$delivered"); append(" delivered") }
            if (failed > 0) { append(" · "); bold("$failed"); append(" not delivered") }
            if (toGo > 0) { append(" · "); bold("$toGo"); append(" to go") }
        },
        style = MaterialTheme.typography.bodyLarge,
    )
    run.map?.let { map ->
        RunMapView(map, seed = run.runId, description = runMapDescription("delivery", hubName, map, next?.street ?: next?.customerSuburb))
    }
    run.toReturn?.let { ret ->
        DriverAlert(
            DriverAlertKind.Muted, Res.drawable.lucide_warehouse,
            title = "${if (ret.count == 1) "1 parcel" else "${ret.count} parcels"} coming back to the hub",
            description = "Check ${if (ret.count == 1) "it" else "them"} in at the hub before the run is done.",
            actions = { DriverButton("Return to hub", onClick = { onOpenReturn(ret.packageCodes.isNotEmpty()) }, style = DriverButtonStyle.Outline, tall = false) },
        )
    }
    Column {
        DriverSectionLabel("Drops, in order")
        DriverGroup {
            val now = rememberNow()
            run.drops.sortedBy { it.sequence }.forEachIndexed { i, d ->
                DropRow(d, isNext = d.dropId == next?.dropId, now = now, last = i == run.drops.lastIndex, onClick = { onOpenDrop(d.dropId) })
            }
        }
    }
}

private fun androidx.compose.ui.text.AnnotatedString.Builder.bold(s: String) = withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(s) }

/** "Van loaded" — every drop is out for delivery (redesign `06 / 01`). */
@Composable
private fun VanLoaded(packages: Int) {
    Row(
        Modifier.fillMaxWidth().clip(EffyStorefrontShape.banner).background(EffyRoles.brandMuted).padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        DriverIcon(Res.drawable.lucide_circle_check, size = 20.dp, tint = EffyRoles.brand, modifier = Modifier.padding(top = 2.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Van loaded", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
            Text("$packages packages · every drop is out for delivery", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DropRow(d: DropSummary, isNext: Boolean, now: Long, last: Boolean, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val (fill, ink) = when {
        d.status == DropStatus.DELIVERED -> EffyRoles.brandMuted to EffyRoles.brand
        isNext -> scheme.primary to scheme.onPrimary
        else -> scheme.surfaceVariant to scheme.onSurface
    }
    val status = when (d.status) {
        DropStatus.DELIVERED -> DriverStatus.Delivered
        DropStatus.FAILED -> DriverStatus.NotDelivered
        else -> windowStatus(d.window, d.status, now)
            ?: if (isNext) DriverStatus.Next else if (d.window != null) DriverStatus.Later else null
    }
    val meta = when (d.status) {
        DropStatus.DELIVERED -> listOfNotNull(d.customerSuburb.takeIf { d.street != null }, d.completedAtIso?.let { timeText(it) }, d.proofMethod?.let(::proofWords))
        DropStatus.FAILED -> listOfNotNull(d.customerSuburb.takeIf { d.street != null }, d.failureReason?.let(::reasonWords))
        else -> listOfNotNull(
            d.customerSuburb.takeIf { d.street != null },
            d.window?.label.takeIf { !isNext },
            packages(d.packageCount),
            "cold".takeIf { d.summary.hasCold },
        )
    }.joinToString(" · ")
    DriverRow(
        title = d.street ?: d.customerSuburb,
        meta = meta,
        last = last,
        onClick = onClick,
        leading = { DriverNumberCircle(d.sequence, fill, ink, size = 40.dp) },
        trailing = {
            status?.let {
                // The next drop's pill reads as "the next thing", in blue, with its window word.
                if (isNext && it == DriverStatus.DueNow) DriverStatusPill(DriverStatus.Next, label = "Due now")
                else DriverStatusPill(it)
            }
        },
    )
}

// ── Return to hub ─────────────────────────────────────────────────────────────────────────────────

/**
 * The parcels from failed drops, coming back (redesign `06 / 11 Return parcels to the hub`, S5). Scan them
 * in, or swipe to check in without scanning.
 */
@Composable
fun ReturnHubScreen(
    state: DeliveryUiState,
    hubName: String?,
    backLabel: String,
    startScanning: Boolean,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    onReturn: (List<HandedOver>) -> Unit,
) {
    val ret = state.run?.toReturn
    var scanning by rememberSaveable { mutableStateOf(startScanning) }
    if (ret != null && scanning && ret.packageCodes.isNotEmpty()) {
        val byCode = ret.parcels.associateBy { it.packageCode }
        ScanPanel(
            title = "Return to hub", backLabel = backLabel,
            context = ScanContexts.returnToHub(ret),
            items = ret.packageCodes.map { c ->
                val p = byCode[c]
                ScanItem(
                    c, p?.ref ?: c, mono = true,
                    meta = listOfNotNull(p?.place, p?.reason?.let(::reasonWords)).joinToString(" · ").ifBlank { null },
                    bannerTitle = p?.ref ?: c, bannerSub = "Back at the hub",
                )
            },
            listTitle = { s, t -> "Parcels · $s of $t checked in" },
            idleSub = "${if (ret.count == 1) "1 parcel" else "${ret.count} parcels"} coming back",
            completeVerb = "checking them in",
            working = state.isWorking, message = state.message,
            onBack = { scanning = false },
            onComplete = { handed -> scanning = false; onReturn(handed) },
            fallbackLabel = "Can't scan? Check in by hand",
            onFallback = { scanning = false },
        )
        return
    }
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Return to hub", backLabel = backLabel, onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter).padding(top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(hubName?.takeIf { it.isNotBlank() } ?: "The hub", fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold)
                Text("Last step of today's delivery run", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            state.run?.map?.hub?.let { hub ->
                DriverButton("Navigate to the hub", onClick = { onNavigate("${hub.lat},${hub.lng}") }, style = DriverButtonStyle.Outline, icon = Res.drawable.lucide_navigation, tall = false, modifier = Modifier.fillMaxWidth())
            }
            if (ret == null) {
                DriverState(Res.drawable.lucide_circle_check, "Nothing to return", "Every parcel from this run is back at the hub or delivered.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${if (ret.count == 1) "1 parcel" else "${ret.count} parcels"} coming back", fontSize = 26.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold)
                    DriverGroup {
                        val rows = ret.parcels.ifEmpty { ret.orders.map { com.effyshopping.driver.mobile.features.delivery.domain.ReturnParcel(it, "", null, null) } }
                        rows.forEachIndexed { i, p ->
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically,
                            ) {
                                DriverIcon(Res.drawable.lucide_package, size = 20.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                Column(Modifier.weight(1f)) {
                                    Text(p.ref, fontFamily = effyMonoFontFamily(), fontSize = 17.sp)
                                    val meta = listOfNotNull(p.place, p.reason?.let(::reasonWords)).joinToString(" · ")
                                    if (meta.isNotEmpty()) Text(meta, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                DriverStatusPill(DriverStatus.NotDelivered, showIcon = false)
                            }
                            if (i < rows.lastIndex) androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                    Text("Dispatch decides when they go out again — you don't need to do anything else with them.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (ret != null) {
            val codes = ret.packageCodes.isNotEmpty()
            if (codes) {
                DriverButton("Scan parcels in", onClick = { scanning = true }, icon = Res.drawable.lucide_scan_line, modifier = Modifier.fillMaxWidth().padding(horizontal = DriverSize.gutter, vertical = 12.dp))
            }
            DriverActionBar {
                DriverSwipeToConfirm(
                    if (codes) "Swipe to check in without scanning" else "Swipe to check them in",
                    onConfirm = { onReturn(emptyList()) }, enabled = !state.isWorking,
                    note = if (codes) "Fallback — use only if the labels won't scan" else "At the hub with the parcels",
                )
            }
        }
    }
}
