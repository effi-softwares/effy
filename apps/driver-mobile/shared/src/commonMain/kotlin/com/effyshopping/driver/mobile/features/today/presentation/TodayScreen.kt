package com.effyshopping.driver.mobile.features.today.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.map.RunMapView
import com.effyshopping.driver.mobile.core.map.runMapDescription
import com.effyshopping.driver.mobile.core.platform.localDateIso
import com.effyshopping.driver.mobile.core.platform.rememberTurnOnNotifications
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverLargeTitleBar
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
import com.effyshopping.driver.mobile.core.presentation.dayText
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis
import com.effyshopping.driver.mobile.core.presentation.rememberIsOpen
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.features.delivery.domain.Handover
import com.effyshopping.driver.mobile.features.delivery.domain.WindowState
import com.effyshopping.driver.mobile.features.delivery.domain.windowStateAt
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.domain.Today
import com.effyshopping.driver.mobile.features.today.domain.TodayItem
import com.effyshopping.driver.mobile.features.today.domain.UpcomingRound
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_bell
import com.effyshopping.driver.mobile.resources.lucide_chevron_right
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_clock
import com.effyshopping.driver.mobile.resources.lucide_door_open
import com.effyshopping.driver.mobile.resources.lucide_hand
import com.effyshopping.driver.mobile.resources.lucide_inbox
import com.effyshopping.driver.mobile.resources.lucide_info
import com.effyshopping.driver.mobile.resources.lucide_navigation
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_power
import com.effyshopping.driver.mobile.resources.lucide_scan_line
import com.effyshopping.driver.mobile.resources.lucide_snowflake
import com.effyshopping.driver.mobile.resources.lucide_store
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_warehouse
import org.jetbrains.compose.resources.DrawableResource

/**
 * Today — the phase-aware home (redesign `03 Today and duty`). The header says the day and where the
 * driver works, with the duty toggle; under it the connection banners ([banners]), then the current run:
 * its progress, one card with the run's map and the next thing to do, what follows, and the rounds later.
 *
 * No currency, ever. Every number here is a count.
 */
@Composable
fun TodayScreen(
    driver: Driver,
    state: TodayUiState,
    onToggleDuty: () -> Unit,
    onRefresh: () -> Unit,
    onOpenRun: (runId: String, phase: Phase) -> Unit,
    onOpenItem: (item: TodayItem, scan: Boolean) -> Unit,
    onOpenReturn: (runId: String, scan: Boolean) -> Unit,
    onNavigate: (String) -> Unit,
    banners: @Composable () -> Unit = {},
    /** Answer today's vehicle check. */
    onSubmitVehicleCheck: (List<com.effyshopping.driver.mobile.features.driver.domain.VehicleCheckAnswer>) -> Unit = {},
) {
    var confirmOffDuty by remember { mutableStateOf(false) }
    val onDuty = state.dutyStatus == DutyStatus.ON_DUTY
    Column(Modifier.fillMaxSize()) {
        DriverLargeTitleBar("Today") {
            DutyToggle(onDuty = onDuty, busy = state.isTogglingDuty, onClick = { if (onDuty) confirmOffDuty = true else onToggleDuty() })
        }
        Text(
            listOfNotNull(
                dayText(localDateIso(nowEpochMillis())),
                driver.hub?.takeIf { it.isNotBlank() },
                driver.vehicle.plate?.takeIf { it.isNotBlank() }?.let { plate ->
                    listOfNotNull(driver.vehicle.type?.takeIf { it.isNotBlank() }, plate).joinToString(" ")
                },
            ).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = DriverSize.gutter),
        )
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter).padding(top = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            banners()
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            val today = state.today
            when {
                !onDuty -> OffDuty(busy = state.isTogglingDuty, onGoOnDuty = onToggleDuty)
                // Before any work, the vehicle is checked; until it is, none is given.
                state.vehicleCheck == com.effyshopping.driver.mobile.features.driver.domain.VehicleCheckStatus.DUE ->
                    VehicleCheckForm(state.vehicleLabel, state.isSubmittingCheck, onSubmitVehicleCheck)
                today == null && state.loadFailed -> DriverState(
                    Res.drawable.lucide_circle_alert,
                    title = "We couldn't load your run",
                    body = "This is on us, not you. Try again, or call dispatch if it keeps happening.",
                    actionLabel = "Try again",
                    onAction = onRefresh,
                )
                today == null -> TodaySkeleton()
                else -> {
                    if (state.vehicleCheck == com.effyshopping.driver.mobile.features.driver.domain.VehicleCheckStatus.UNSAFE) {
                        DriverAlert(
                            DriverAlertKind.Problem, Res.drawable.lucide_circle_alert,
                            title = "Your vehicle check found something unsafe",
                            description = "Dispatch has been told. You'll get work once it's fixed and cleared.",
                        )
                    }
                    OnDuty(today, driver.hub, state.isReturning, onOpenRun, onOpenItem, onOpenReturn, onNavigate)
                }
            }
        }
    }
    if (confirmOffDuty) {
        GoOffDutySheet(
            today = state.today,
            hub = driver.hub,
            onConfirm = { confirmOffDuty = false; onToggleDuty() },
            onDismiss = { confirmOffDuty = false },
        )
    }
}

@Composable
private fun DutyToggle(onDuty: Boolean, busy: Boolean, onClick: () -> Unit) {
    val tint = if (onDuty) EffyRoles.brand else MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        Modifier
            .size(DriverSize.target)
            .clip(CircleShape)
            .clickable(enabled = !busy, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = if (onDuty) "On duty. Tap to go off duty." else "Off duty. Tap to go on duty." },
        contentAlignment = Alignment.Center,
    ) {
        DriverIcon(Res.drawable.lucide_power, size = 26.dp, tint = tint)
        if (onDuty) {
            Box(
                Modifier.align(Alignment.TopEnd).padding(top = 8.dp, end = 8.dp).size(12.dp).clip(CircleShape)
                    .background(MaterialTheme.colorScheme.background).padding(2.dp).clip(CircleShape).background(EffyRoles.brand),
            )
        }
    }
}

@Composable
private fun OffDuty(busy: Boolean, onGoOnDuty: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(top = 56.dp, start = 8.dp, end = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            DriverIcon(Res.drawable.lucide_power, size = 32.dp)
        }
        Text("You're off duty", fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "Go on duty to see your runs. New work is only given to drivers who are on duty.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        DriverButton(
            "Go on duty",
            onClick = onGoOnDuty,
            icon = Res.drawable.lucide_power,
            loading = busy,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        )
    }
}

@Composable
private fun OnDuty(
    today: Today,
    hub: String?,
    returning: Boolean,
    onOpenRun: (String, Phase) -> Unit,
    onOpenItem: (TodayItem, Boolean) -> Unit,
    onOpenReturn: (String, Boolean) -> Unit,
    onNavigate: (String) -> Unit,
) {
    val runId = today.activeRunId
    val active = today.active
    val toReturn = today.toReturn
    when {
        runId != null && active != null -> CurrentRun(today, runId, active, hub, onOpenRun, onOpenItem, onNavigate)
        // A delivery run not yet loaded has one next step, before any drop.
        today.loadStep != null -> LoadStepCard(today, today.loadStep, onOpenRun)
        toReturn != null -> ReturnStep(today, onOpenReturn, onNavigate, returning)
        else -> {
            DriverState(
                Res.drawable.lucide_inbox,
                title = "No work yet",
                body = "You're on duty. When a run is assigned you'll get a notification, and it appears here by itself.",
            )
            NotificationsOffAlert()
        }
    }
    if (today.upcoming.isNotEmpty()) LaterToday(today.upcoming, onOpenRun)
}

/** The run's head: its name, the time on the right, the progress bar and the counts under it. */
@Composable
private fun RunHead(today: Today, collection: Boolean, onOpenRun: (() -> Unit)? = null) {
    val open = rememberIsOpen(today.opening)
    val progress = today.progress
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            // The heading opens the whole run — every stop in order (the card below opens just the next one).
            Row(
                Modifier.weight(1f).then(
                    if (onOpenRun != null) Modifier.clickable(role = Role.Button, onClickLabel = "Open the run", onClick = onOpenRun) else Modifier,
                ),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    if (collection) "Collection run" else "Delivery run",
                    fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold,
                )
                if (onOpenRun != null) DriverIcon(Res.drawable.lucide_chevron_right, size = 20.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val right = when {
                !open && today.opening != null -> listOfNotNull(today.opening.sentence, today.dueLabel?.let { "finish by $it" }).joinToString(" · ")
                collection -> today.dueLabel?.let { "Finish by $it" }
                else -> today.active?.window?.label ?: today.dueLabel?.let { "Finish by $it" }
            }
            right?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.End, modifier = Modifier.padding(start = 12.dp, top = 3.dp))
            }
        }
        if (progress != null && open && progress.total > 0) {
            DriverProgress(progress.done.toFloat() / progress.total, done = !collection)
            Text(
                if (collection) {
                    "${progress.done} of ${progress.total} shops collected · ${progress.packagesInVan} ${if (progress.packagesInVan == 1) "package" else "packages"} in the van"
                } else {
                    listOfNotNull(
                        "${progress.delivered} of ${progress.total} delivered",
                        progress.notDelivered.takeIf { it > 0 }?.let { "$it not delivered" },
                        today.dueLabel?.let { "finish by $it" },
                    ).joinToString(" · ")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CurrentRun(
    today: Today,
    runId: String,
    active: TodayItem,
    hub: String?,
    onOpenRun: (String, Phase) -> Unit,
    onOpenItem: (TodayItem, Boolean) -> Unit,
    onNavigate: (String) -> Unit,
) {
    val collection = today.phase == Phase.COLLECTION
    val open = rememberIsOpen(today.opening)
    RunHead(today, collection, onOpenRun = { onOpenRun(runId, today.phase) })
    today.changedNote?.let { note ->
        var seen by rememberSaveable(runId, note) { mutableStateOf(false) }
        if (!seen) {
            DriverAlert(
                DriverAlertKind.Info, Res.drawable.lucide_info,
                title = "Dispatch changed this run",
                description = note,
                actions = { TextLink("Got it") { seen = true } },
            )
        }
    }
    val opening = today.opening
    if (!open && opening != null) {
        DriverAlert(
            DriverAlertKind.Info, Res.drawable.lucide_clock,
            title = "Opens at ${opening.label}",
            description = "Look through the run now. ${if (collection) "Collecting" else "Delivering"} unlocks when it opens.",
        )
    }
    if (today.stale) {
        Text("Last loaded copy — changes since then won't show.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    // The run's map belongs to the run (like the heading, it opens it) — its own block, not the stop's card.
    today.map?.let { map ->
        RunMapView(
            map = map,
            seed = runId,
            description = runMapDescription(if (collection) "collection" else "delivery", hub, map, active.street ?: active.title),
            height = 170.dp,
            onClick = { onOpenRun(runId, today.phase) },
        )
    }
    RunCard(today, runId, active, hub, collection, open, onOpenRun, onOpenItem, onNavigate)
    if (today.upNext.isNotEmpty()) {
        Column {
            DriverSectionLabel("Up next", Modifier.padding(top = 8.dp))
            DriverGroup {
                val position = (today.progress?.done ?: 0) + 2
                var n = position
                today.upNext.forEachIndexed { i, item ->
                    val hubRow = item.kind == TodayItem.Kind.HUB_CHECKIN
                    DriverRow(
                        title = if (hubRow) "Hub check-in" else (item.street ?: item.title),
                        meta = if (hubRow) {
                            listOfNotNull(hub?.takeIf { it.isNotBlank() }, "hand over every package · ends the run").joinToString(" · ")
                        } else upNextMeta(item, collection),
                        last = i == today.upNext.lastIndex,
                        onClick = { onOpenItem(item, false) },
                        leading = {
                            if (hubRow) {
                                Box(Modifier.size(32.dp).clip(CircleShape).background(EffyRoles.primaryMuted), contentAlignment = Alignment.Center) {
                                    DriverIcon(Res.drawable.lucide_warehouse, size = 16.dp, tint = MaterialTheme.colorScheme.primary)
                                }
                            } else {
                                DriverNumberCircle(n++, MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurface)
                            }
                        },
                        trailing = { DriverIcon(Res.drawable.lucide_chevron_right, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                    )
                }
            }
        }
    }
}

/** "High St, Northcote · 3 packages" (shop) or "Carlton · 4 pm – 6 pm · 2 packages" (drop). */
private fun upNextMeta(item: TodayItem, collection: Boolean): String? = listOfNotNull(
    if (collection) item.place else item.title.takeIf { item.street != null },
    if (collection) null else item.window?.label,
    item.packageCount.takeIf { it > 0 }?.let { if (it == 1) "1 package" else "$it packages" },
).joinToString(" · ").ifBlank { item.subtitle }

/** The one card on Today: the run's map, then what to do next with its two actions. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RunCard(
    today: Today,
    runId: String,
    active: TodayItem,
    hub: String?,
    collection: Boolean,
    open: Boolean,
    onOpenRun: (String, Phase) -> Unit,
    onOpenItem: (TodayItem, Boolean) -> Unit,
    onNavigate: (String) -> Unit,
) {
    val shape = EffyStorefrontShape.banner
    val hubStop = active.kind == TodayItem.Kind.HUB_CHECKIN
    val position = (today.progress?.done ?: 0) + 1
    val total = today.progress?.total ?: 0
    // The whole card opens the stop; its buttons (Navigate, Scan) keep their own actions — a child's
    // click is consumed before the card's. The run map is not in here: it opens the run, so it sits with
    // the run's heading above, not inside the stop's card.
    Column(
        Modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .clickable(role = Role.Button, onClickLabel = if (collection) "Open the stop" else "Open the drop") { onOpenItem(active, false) },
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val badge = when {
                    hubStop -> "Last stop"
                    !open -> if (collection) "First stop · 1 of $total" else "First drop · 1 of $total"
                    total > 0 -> if (collection) "Next · stop $position of $total" else "Next · drop $position of $total"
                    else -> "Next"
                }
                DriverStatusPill(if (hubStop) DriverStatus.Last else DriverStatus.Next, label = badge, showIcon = false)
                Box(Modifier.weight(1f))
                if (collection) {
                    if (active.packageCount > 0) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            DriverIcon(Res.drawable.lucide_package, size = 14.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                listOfNotNull(
                                    if (active.packageCount == 1) "1 package" else "${active.packageCount} packages",
                                    active.coldCount.takeIf { it > 0 }?.let { "$it cold" },
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    active.window?.let { w ->
                        val state = windowStateAt(nowEpochMillis(), w)
                        if (state == WindowState.Due) DriverStatusPill(DriverStatus.DueNow)
                        if (state == WindowState.Late) DriverStatusPill(DriverStatus.Late)
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    if (hubStop) (hub?.takeIf { it.isNotBlank() } ?: "Hub check-in") else (active.street ?: active.title),
                    fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                val place = if (hubStop) "Hand over every package · ends the run"
                else listOfNotNull(active.place, if (collection) null else active.window?.label).joinToString(" · ").ifBlank { null }
                place?.let { Text(it, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            if (!collection && !hubStop) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    when (active.handover) {
                        Handover.LeaveAtDoor -> Chip(Res.drawable.lucide_door_open, "Leave at the door")
                        Handover.MeetAtDoor -> Chip(Res.drawable.lucide_hand, "Hand it over")
                        null -> Unit
                    }
                    if (active.packageCount > 0) Chip(Res.drawable.lucide_package, if (active.packageCount == 1) "1 package" else "${active.packageCount} packages")
                    if (active.coldCount > 0) Chip(Res.drawable.lucide_snowflake, "Cold")
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val address = when {
                    hubStop -> today.map?.hub?.let { "${it.lat},${it.lng}" }
                    collection -> active.place
                    else -> listOfNotNull(active.street, active.place).joinToString(", ").ifBlank { null }
                }
                DriverButton(
                    "Navigate", onClick = { address?.let(onNavigate) }, enabled = address != null,
                    style = DriverButtonStyle.Outline, icon = Res.drawable.lucide_navigation, tall = false, modifier = Modifier.weight(1f),
                )
                when {
                    !open -> DriverButton("View ${if (collection) "stop" else "drop"}", onClick = { onOpenItem(active, false) }, style = DriverButtonStyle.Secondary, tall = false, modifier = Modifier.weight(1f))
                    hubStop -> DriverButton("Check in", onClick = { onOpenItem(active, false) }, icon = Res.drawable.lucide_warehouse, tall = false, modifier = Modifier.weight(1f))
                    collection -> DriverButton("Scan packages", onClick = { onOpenItem(active, true) }, tall = false, modifier = Modifier.weight(1f))
                    else -> DriverButton("I'm here — scan", onClick = { onOpenItem(active, true) }, tall = false, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun Chip(icon: DrawableResource, label: String) {
    Row(
        Modifier.clip(EffyStorefrontShape.control).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        DriverIcon(icon, size = 13.dp)
        Text(label, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TextLink(label: String, onClick: () -> Unit) {
    Text(
        label,
        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
        color = MaterialTheme.colorScheme.primary,
        textDecoration = TextDecoration.Underline,
        modifier = Modifier.clickable(role = Role.Button, onClick = onClick).padding(vertical = 10.dp),
    )
}

/** Only parcels from failed drops are left: take them back to the hub (redesign `07 Today — return parcels`). */
/**
 * "Load the van": the first step of a delivery run, and the only one until it is done. The drops
 * are listed after it; none of them can be started before the van is loaded.
 */
@Composable
private fun LoadStepCard(today: Today, step: com.effyshopping.driver.mobile.features.today.domain.LoadStep, onOpenRun: (String, Phase) -> Unit) {
    val open = rememberIsOpen(today.opening)
    RunHead(today, collection = false, onOpenRun = { onOpenRun(step.runId, today.phase) })
    val shape = EffyStorefrontShape.banner
    Column(
        Modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        DriverStatusPill(DriverStatus.Next, label = "First step", showIcon = false)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Load the van", fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "${if (step.packageCount == 1) "1 package" else "${step.packageCount} packages"} for " +
                    "${if (step.dropCount == 1) "1 drop" else "${step.dropCount} drops"}. Load the last drops first, so drop 1 ends up nearest the door.",
                style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (!open && today.opening != null) {
            Text("Opens ${today.opening.label}. Look through the run now.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        DriverButton(
            if (open) "Load the van" else "View the run",
            onClick = { onOpenRun(step.runId, today.phase) },
            icon = Res.drawable.lucide_scan_line,
            style = if (open) DriverButtonStyle.Primary else DriverButtonStyle.Secondary,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ReturnStep(today: Today, onOpenReturn: (String, Boolean) -> Unit, onNavigate: (String) -> Unit, returning: Boolean) {
    val toReturn = today.toReturn ?: return
    RunHead(today, collection = false)
    val shape = EffyStorefrontShape.banner
    val parcels = if (toReturn.count == 1) "1 parcel" else "${toReturn.count} parcels"
    val first = toReturn.parcels.firstOrNull()
    Column(
        Modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        DriverStatusPill(DriverStatus.Last, label = "Last step", showIcon = false)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Return $parcels to the hub", fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold)
            Text(
                listOfNotNull(
                    first?.place?.let { "Not delivered at $it" + (first.reason?.let { r -> " — ${reasonWords(r)}" } ?: "") + "." },
                    "Check ${if (toReturn.count == 1) "it" else "them"} back in and the run is done.",
                ).joinToString(" "),
                style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val hubPoint = today.map?.hub?.let { "${it.lat},${it.lng}" }
            DriverButton("To the hub", onClick = { hubPoint?.let(onNavigate) }, enabled = hubPoint != null, style = DriverButtonStyle.Outline, icon = Res.drawable.lucide_navigation, tall = false, modifier = Modifier.weight(1f))
            DriverButton(
                if (toReturn.bagCodes.isNotEmpty()) "Scan in" else "Check in",
                onClick = { onOpenReturn(toReturn.runId, toReturn.bagCodes.isNotEmpty()) },
                loading = returning, icon = Res.drawable.lucide_scan_line, tall = false, modifier = Modifier.weight(1f),
            )
        }
    }
}

internal fun reasonWords(r: com.effyshopping.driver.mobile.features.delivery.domain.FailureReason): String = when (r) {
    com.effyshopping.driver.mobile.features.delivery.domain.FailureReason.NOBODY_HOME -> "nobody home"
    com.effyshopping.driver.mobile.features.delivery.domain.FailureReason.WRONG_ADDRESS -> "wrong address"
    com.effyshopping.driver.mobile.features.delivery.domain.FailureReason.CUSTOMER_REFUSED -> "customer refused it"
    com.effyshopping.driver.mobile.features.delivery.domain.FailureReason.ACCESS_BLOCKED -> "couldn't get in"
    com.effyshopping.driver.mobile.features.delivery.domain.FailureReason.OTHER -> "something else"
}

@Composable
private fun LaterToday(rounds: List<UpcomingRound>, onOpenRun: (String, Phase) -> Unit) {
    Column {
        DriverSectionLabel("Later today", Modifier.padding(top = 8.dp))
        DriverGroup {
            rounds.forEachIndexed { i, r ->
                val collection = r.phase == Phase.COLLECTION
                val places = if (collection) {
                    if (r.stopCount == 1) "1 shop" else "${r.stopCount} shops"
                } else {
                    if (r.stopCount == 1) "1 drop" else "${r.stopCount} drops"
                }
                DriverRow(
                    title = if (collection) "Collection run" else "Delivery run",
                    meta = "Finish by ${r.dueLabel} · $places",
                    last = i == rounds.lastIndex,
                    onClick = { onOpenRun(r.runId, r.phase) },
                    leading = {
                        Box(Modifier.size(32.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                            DriverIcon(if (collection) Res.drawable.lucide_store else Res.drawable.lucide_truck, size = 16.dp)
                        }
                    },
                    trailing = {
                        val opens = r.opening
                        if (opens != null && !rememberIsOpen(opens)) {
                            Text(
                                opens.sentence,
                                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                                modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control).padding(horizontal = 9.dp, vertical = 4.dp),
                            )
                        } else {
                            DriverIcon(Res.drawable.lucide_chevron_right, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun NotificationsOffAlert() {
    val turnOn = rememberTurnOnNotifications() ?: return
    DriverAlert(
        DriverAlertKind.Problem, Res.drawable.lucide_bell,
        title = "Notifications are off",
        description = "You won't hear about new work while the app is closed.",
        actions = { DriverButton("Turn on in Settings", onClick = turnOn, style = DriverButtonStyle.Outline, tall = false) },
    )
}

/** Loading: the shape of Today (redesign States — "Loading, the shape of Today"). */
@Composable
private fun TodaySkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val shape = EffyStorefrontShape.banner
        Column(
            Modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DriverSkeleton(Modifier.fillMaxWidth(0.4f), height = 20.dp)
            DriverSkeleton(Modifier.fillMaxWidth(0.7f), height = 28.dp)
            DriverSkeleton(Modifier.fillMaxWidth(0.55f), height = 16.dp)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                DriverSkeleton(Modifier.weight(1f), height = 52.dp)
                DriverSkeleton(Modifier.weight(1f), height = 52.dp)
            }
        }
        DriverGroup {
            repeat(2) {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    DriverSkeleton(Modifier.size(32.dp), height = 32.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        DriverSkeleton(Modifier.fillMaxWidth(0.6f))
                        DriverSkeleton(Modifier.fillMaxWidth(0.4f), height = 12.dp)
                    }
                }
            }
        }
    }
}

/** "Go off duty?" — names the work still held, so nobody walks away from a van of parcels unaware. */
@Composable
private fun GoOffDutySheet(today: Today?, hub: String?, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val held = today?.remainingCount ?: 0
    val inVan = today?.progress?.packagesInVan ?: 0
    val toReturn = today?.toReturn?.count ?: 0
    val run = when (today?.phase) {
        Phase.COLLECTION -> "this collection run"
        Phase.DELIVERY -> "this delivery run"
        else -> "your run"
    }
    DriverSheet(
        title = "Go off duty?",
        description = when {
            held > 0 -> "You still have $held ${if (held == 1) "stop" else "stops"} on $run" +
                (if (inVan > 0) " and $inVan ${if (inVan == 1) "package" else "packages"} in the van" else "") +
                ". Dispatch will be told, and may give the run to someone else."
            else -> "You won't be given new work until you go back on duty."
        },
        icon = Res.drawable.lucide_power,
        onDismiss = onDismiss,
    ) {
        if (held > 0 || toReturn > 0) {
            DriverAlert(
                DriverAlertKind.Muted, Res.drawable.lucide_package,
                title = "Packages in the van stay with you",
                description = "Take them to ${hub?.takeIf { it.isNotBlank() } ?: "the hub"} and check them in before you finish.",
            )
        }
        DriverButton("Go off duty", onClick = onConfirm, style = DriverButtonStyle.Problem, modifier = Modifier.fillMaxWidth())
        DriverButton("Stay on duty", onClick = onDismiss, style = DriverButtonStyle.Ghost, tall = false, modifier = Modifier.fillMaxWidth())
    }
}
