package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.presentation.DriverActionBar
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
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
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_clock
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_warehouse
import com.effyshopping.driver.mobile.resources.lucide_scan_line
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.effyshopping.driver.mobile.core.scan.HandedOver
import com.effyshopping.driver.mobile.core.scan.ScanContexts
import com.effyshopping.driver.mobile.core.scan.ScanItem
import com.effyshopping.driver.mobile.core.scan.ScanPanel

/**
 * A delivery run (canvas `DeliveryRun`, `LoadVan`, `ReturnHub`): how far through it the driver is, the
 * one step to load the van, the drops in order with their status, and the next drop pinned at the bottom.
 */
@Composable
fun DeliveryRunScreen(
    state: DeliveryUiState,
    hubName: String?,
    onBack: () -> Unit,
    onOpenDrop: (String) -> Unit,
    onRefresh: () -> Unit,
    onLoadVan: (List<HandedOver>) -> Unit,
    onReturnParcels: (List<HandedOver>) -> Unit,
) {
    val run = state.run
    var scan by rememberSaveable { mutableStateOf<String?>(null) }
    if (run != null && scan == "load") {
        ScanPanel(
            title = "Load the van", backLabel = "Run",
            context = ScanContexts.load(run),
            items = run.drops.filter { it.status == DropStatus.STAGED }.sortedByDescending { it.sequence }
                .flatMap { d -> d.packageCodes.map { ScanItem(it, "Drop ${d.sequence} · ${d.customerSuburb}") } },
            completeLabel = "Starting the run",
            working = state.isWorking, message = state.message,
            onBack = { scan = null },
            onComplete = { handed -> scan = null; onLoadVan(handed) },
        )
        return
    }
    val ret = run?.toReturn
    if (ret != null && scan == "return") {
        ScanPanel(
            title = "Return to hub", backLabel = "Run",
            context = ScanContexts.returnToHub(ret),
            items = ret.packageCodes.mapIndexed { i, c -> ScanItem(c, "Parcel ${i + 1} of ${ret.packageCodes.size}", hint = "Not delivered") },
            completeLabel = "Checking them in",
            working = state.isWorking, message = state.message,
            onBack = { scan = null },
            onComplete = { handed -> scan = null; onReturnParcels(handed) },
        )
        return
    }
    val open = rememberIsOpen(run?.opening)
    val next = run?.drops?.filter { !it.status.isClosed }?.minByOrNull { it.sequence }
    val staged = run?.drops?.count { it.status == DropStatus.STAGED } ?: 0
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Delivery run", backLabel = "Today", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            when {
                run == null && state.isLoading -> RunSkeleton()
                run == null -> DriverState(
                    Res.drawable.lucide_circle_alert, "This run didn't load", "That's on us. Check your signal and try again.",
                    actionLabel = "Try again", onAction = onRefresh,
                )
                else -> RunBody(
                    run, hubName, open, staged, state.isWorking, onOpenDrop,
                    onScanLoad = { scan = "load" }, onLoadVan = { onLoadVan(emptyList()) },
                    onScanReturn = { scan = "return" }, onReturnParcels = { onReturnParcels(emptyList()) },
                )
            }
        }
        if (run != null && next != null && open && staged == 0) {
            DriverActionBar {
                DriverButton(
                    "Open next drop · ${next.customerSuburb}",
                    onClick = { onOpenDrop(next.dropId) },
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
    working: Boolean,
    onOpenDrop: (String) -> Unit,
    onScanLoad: () -> Unit,
    onLoadVan: () -> Unit,
    onScanReturn: () -> Unit,
    onReturnParcels: () -> Unit,
) {
    val total = run.drops.size
    val delivered = run.drops.count { it.status == DropStatus.DELIVERED }
    val failed = run.drops.count { it.status == DropStatus.FAILED }
    val toGo = total - delivered - failed
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val from = listOfNotNull(hubName?.takeIf { it.isNotBlank() }?.let { "From $it" }, run.dueLabel?.let { "finish by $it" })
        if (from.isNotEmpty()) {
            Text(from.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        DriverProgress(if (total == 0) 0f else (delivered + failed).toFloat() / total, done = true)
        Text(
            buildList {
                add("${delivered + failed} of $total done")
                if (delivered > 0) add("$delivered delivered")
                if (failed > 0) add("$failed not delivered")
                if (toGo > 0) add("$toGo to go")
            }.joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    val opening = run.opening
    if (!open && opening != null) {
        DriverAlert(
            DriverAlertKind.Info, Res.drawable.lucide_clock,
            title = opening.sentence,
            description = "Look through the run now. Loading and delivering unlock when it opens.",
        )
    } else if (staged > 0) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DriverAlert(
                DriverAlertKind.Info, Res.drawable.lucide_truck,
                title = "Load the van",
                description = "${packages(run.drops.filter { it.status == DropStatus.STAGED }.sumOf { it.packageCount })} for " +
                    "${if (staged == 1) "1 drop" else "$staged drops"}. Load the last drops first, so drop 1 ends up nearest the door. " +
                    "When you're done, every drop goes out for delivery.",
            )
            val codes = run.drops.any { it.status == DropStatus.STAGED && it.packageCodes.isNotEmpty() }
            if (codes) DriverButton("Scan to load", onClick = onScanLoad, icon = Res.drawable.lucide_scan_line, modifier = Modifier.fillMaxWidth())
            DriverButton(
                if (codes) "Can't scan? Mark all loaded" else "Mark all loaded",
                onClick = onLoadVan, loading = working,
                style = if (codes) DriverButtonStyle.Ghost else DriverButtonStyle.Primary,
                icon = if (codes) null else Res.drawable.lucide_package,
                tall = !codes, modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    run.toReturn?.let { ret ->
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DriverAlert(
                DriverAlertKind.Muted, Res.drawable.lucide_warehouse,
                title = "${if (ret.count == 1) "1 parcel" else "${ret.count} parcels"} coming back to the hub",
                description = (ret.orders.takeIf { it.isNotEmpty() }?.let { "${it.joinToString(", ")}. " } ?: "") +
                    "Dispatch decides when they go out again — you don't need to do anything else with them.",
            )
            if (ret.packageCodes.isNotEmpty()) {
                DriverButton("Scan parcels in", onClick = onScanReturn, icon = Res.drawable.lucide_scan_line, modifier = Modifier.fillMaxWidth())
            }
            DriverSwipeToConfirm(
                if (ret.packageCodes.isNotEmpty()) "Swipe to check in without scanning" else "Swipe to check them in",
                onConfirm = onReturnParcels, enabled = !working,
                note = if (ret.packageCodes.isNotEmpty()) "Use only if the labels won't scan" else "At the hub with the parcels",
            )
        }
    }

    Column {
        DriverSectionLabel("Drops, in order")
        DriverGroup {
            val now = rememberNow()
            val nextId = run.drops.filter { !it.status.isClosed }.minByOrNull { it.sequence }?.dropId
            run.drops.sortedBy { it.sequence }.forEachIndexed { i, d ->
                DropRow(d, isNext = d.dropId == nextId, now = now, last = i == run.drops.lastIndex, onClick = { onOpenDrop(d.dropId) })
            }
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
        else -> windowStatus(d.window, d.status, now) ?: if (isNext) DriverStatus.Next else null
    }
    val meta = buildList {
        d.window?.let { add(it.label) }
        add(packages(d.packageCount))
        if (d.summary.hasCold) add("cold")
    }.joinToString(" · ")
    DriverRow(
        title = d.customerSuburb,
        meta = meta,
        last = last,
        onClick = onClick,
        leading = { DriverNumberCircle(d.sequence, fill, ink) },
        trailing = { status?.let { DriverStatusPill(it) } },
    )
}

@Composable
private fun RunSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        DriverSkeleton(Modifier.fillMaxWidth(0.6f))
        DriverSkeleton(Modifier.fillMaxWidth(), height = 6.dp)
        repeat(5) { DriverSkeleton(Modifier.fillMaxWidth(), height = 64.dp) }
    }
}

