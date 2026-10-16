package com.effyshopping.driver.mobile.features.today.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
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
import com.effyshopping.driver.mobile.resources.lucide_inbox
import com.effyshopping.driver.mobile.resources.lucide_info
import androidx.compose.runtime.saveable.rememberSaveable
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_power
import com.effyshopping.driver.mobile.resources.lucide_store
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_warehouse

/**
 * Today — the phase-aware home (canvas `Main` and its states). The header says the day and where the
 * driver works, with the duty toggle; below it the connection banners (passed in as [banners]), then
 * the current run: what is next, what follows, and the rounds later today.
 *
 * ⚠ No currency, ever. Every number here is a count.
 */
@Composable
fun TodayScreen(
    driver: Driver,
    state: TodayUiState,
    onToggleDuty: () -> Unit,
    onRefresh: () -> Unit,
    onOpenRun: (runId: String, phase: Phase) -> Unit,
    onOpenItem: (TodayItem) -> Unit,
    onReturnParcels: () -> Unit,
    banners: @Composable () -> Unit = {},
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
            modifier = Modifier.padding(horizontal = DriverSize.gutter).padding(bottom = 4.dp),
        )
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            banners()
            state.message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            val today = state.today
            when {
                !onDuty -> OffDuty(busy = state.isTogglingDuty, onGoOnDuty = onToggleDuty)
                today == null && state.loadFailed -> DriverState(
                    Res.drawable.lucide_circle_alert,
                    title = "Your work didn't load",
                    body = "That's on us. Check your signal and try again.",
                    actionLabel = "Try again",
                    onAction = onRefresh,
                )
                today == null -> TodaySkeleton()
                else -> OnDuty(today, state.isReturning, onOpenRun, onOpenItem, onReturnParcels)
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
        DriverIcon(Res.drawable.lucide_power, size = 24.dp, tint = tint)
        if (onDuty) {
            Box(
                Modifier.align(Alignment.TopEnd).padding(top = 10.dp, end = 10.dp).size(12.dp).clip(CircleShape)
                    .background(MaterialTheme.colorScheme.background).padding(2.dp).clip(CircleShape).background(EffyRoles.brand),
            )
        }
    }
}

@Composable
private fun OffDuty(busy: Boolean, onGoOnDuty: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(top = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            DriverIcon(Res.drawable.lucide_power, size = 32.dp)
        }
        Text("You're off duty", fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "Go on duty to see your runs. New work is only given to drivers who are on duty.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        DriverButton(
            "Go on duty",
            onClick = onGoOnDuty,
            icon = Res.drawable.lucide_power,
            loading = busy,
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        )
    }
}

@Composable
private fun OnDuty(
    today: Today,
    returning: Boolean,
    onOpenRun: (String, Phase) -> Unit,
    onOpenItem: (TodayItem) -> Unit,
    onReturnParcels: () -> Unit,
) {
    val runId = today.activeRunId
    val active = today.active
    val toReturn = today.toReturn
    when {
        runId != null && active != null -> CurrentRun(today, runId, active, onOpenRun, onOpenItem)
        toReturn != null -> ReturnStep(toReturn, returning, onOpenRun, onReturnParcels)
        else -> {
            DriverState(
                Res.drawable.lucide_inbox,
                title = if (today.upcoming.isEmpty()) "No work yet" else "Nothing to do right now",
                body = if (today.upcoming.isEmpty()) {
                    "You're on duty. When a run is assigned you'll get a notification, and it appears here by itself."
                } else {
                    "Your next run is below. It appears here by itself when it's time."
                },
            )
            NotificationsOffAlert()
        }
    }
    if (today.upcoming.isNotEmpty()) LaterToday(today.upcoming, onOpenRun)
}

@Composable
private fun CurrentRun(today: Today, runId: String, active: TodayItem, onOpenRun: (String, Phase) -> Unit, onOpenItem: (TodayItem) -> Unit) {
    val collection = today.phase == Phase.COLLECTION
    val open = rememberIsOpen(today.opening)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                if (collection) "Collection run" else "Delivery run",
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.weight(1f),
            )
            today.dueLabel?.let {
                Text("Finish by $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        val opening = today.opening
        if (!open && opening != null) {
            DriverAlert(
                DriverAlertKind.Info, Res.drawable.lucide_clock,
                title = opening.sentence,
                description = "Look through the run now. ${if (collection) "Collecting" else "Delivering"} unlocks when it opens.",
            )
        }
        today.changedNote?.let { note ->
            var seen by rememberSaveable(runId, note) { mutableStateOf(false) }
            if (!seen) {
                DriverAlert(
                    DriverAlertKind.Info, Res.drawable.lucide_info,
                    title = "Dispatch changed this run",
                    description = note,
                    actions = { DriverButton("Got it", onClick = { seen = true }, style = DriverButtonStyle.Ghost, tall = false) },
                )
            }
        }
        if (today.stale) {
            Text(
                "Last loaded copy — changes since then won't show.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Hero(
            badge = if (active.kind == TodayItem.Kind.HUB_CHECKIN) "Last stop" else "Next",
            remaining = today.remainingCount,
            title = active.title,
            subtitle = active.subtitle,
            primaryLabel = when (active.kind) {
                TodayItem.Kind.COLLECTION_STOP -> "Open stop"
                TodayItem.Kind.DELIVERY_DROP -> "Open drop"
                TodayItem.Kind.HUB_CHECKIN -> "Check in at the hub"
            },
            onPrimary = { onOpenItem(active) },
            onWholeRun = { onOpenRun(runId, today.phase) },
        )
        if (today.upNext.isNotEmpty()) {
            Column {
                DriverSectionLabel("Up next", Modifier.padding(top = 8.dp))
                DriverGroup {
                    today.upNext.forEachIndexed { i, item ->
                        val hub = item.kind == TodayItem.Kind.HUB_CHECKIN
                        DriverRow(
                            title = if (hub) "Hub check-in" else item.title,
                            meta = if (hub) "Hand over every package · ends the run" else item.subtitle,
                            last = i == today.upNext.lastIndex,
                            onClick = { onOpenItem(item) },
                            leading = {
                                if (hub) {
                                    Box(Modifier.size(32.dp).clip(CircleShape).background(EffyRoles.primaryMuted), contentAlignment = Alignment.Center) {
                                        DriverIcon(Res.drawable.lucide_warehouse, size = 16.dp, tint = MaterialTheme.colorScheme.primary)
                                    }
                                } else {
                                    DriverNumberCircle(i + 2, MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurface)
                                }
                            },
                            trailing = { DriverIcon(Res.drawable.lucide_chevron_right, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                        )
                    }
                }
            }
        }
    }
}

/** The one card on Today: what to do next, with its action. */
@Composable
private fun Hero(
    badge: String,
    remaining: Int?,
    title: String,
    subtitle: String?,
    primaryLabel: String,
    onPrimary: () -> Unit,
    onWholeRun: () -> Unit,
    badgeIsLast: Boolean = false,
    primaryLoading: Boolean = false,
) {
    val shape = EffyStorefrontShape.card
    Column(
        Modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            DriverStatusPill(if (badgeIsLast) DriverStatus.Last else DriverStatus.Next, label = badge)
            Box(Modifier.weight(1f))
            if (remaining != null && remaining > 0) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    DriverIcon(Res.drawable.lucide_package, size = 14.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("$remaining left", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Column {
            Text(title, fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DriverButton("Whole run", onClick = onWholeRun, style = DriverButtonStyle.Outline, tall = false, modifier = Modifier.weight(1f))
            DriverButton(primaryLabel, onClick = onPrimary, tall = false, loading = primaryLoading, modifier = Modifier.weight(1f))
        }
    }
}

/** 088 — only parcels from failed drops are left: take them back to the hub (canvas `Today-ReturnHub`). */
@Composable
private fun ReturnStep(toReturn: ParcelsToReturn, returning: Boolean, onOpenRun: (String, Phase) -> Unit, onReturnParcels: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Delivery run", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold))
        val parcels = if (toReturn.count == 1) "1 parcel" else "${toReturn.count} parcels"
        Hero(
            badge = "Last step",
            badgeIsLast = true,
            remaining = null,
            title = "Return $parcels to the hub",
            subtitle = "Not delivered" + (toReturn.orders.takeIf { it.isNotEmpty() }?.let { " · ${it.joinToString(", ")}" } ?: "") +
                ". Check ${if (toReturn.count == 1) "it" else "them"} back in and the run is done.",
            primaryLabel = "Return all",
            primaryLoading = returning,
            onPrimary = onReturnParcels,
            onWholeRun = { onOpenRun(toReturn.runId, Phase.DELIVERY) },
        )
    }
}

@Composable
private fun LaterToday(rounds: List<UpcomingRound>, onOpenRun: (String, Phase) -> Unit) {
    Column {
        DriverSectionLabel("Later")
        DriverGroup {
            rounds.forEachIndexed { i, r ->
                val collection = r.phase == Phase.COLLECTION
                val places = if (collection) {
                    if (r.stopCount == 1) "1 shop" else "${r.stopCount} shops"
                } else {
                    if (r.stopCount == 1) "1 drop" else "${r.stopCount} drops"
                }
                val packages = if (r.packageCount == 1) "1 package" else "${r.packageCount} packages"
                DriverRow(
                    title = if (collection) "Collection run" else "Delivery run",
                    meta = "$places · $packages · finish by ${r.dueLabel}",
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
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outline, CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
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

@Composable
private fun TodaySkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        DriverSkeleton(Modifier.fillMaxWidth(0.5f), height = 22.dp)
        DriverSkeleton(Modifier.fillMaxWidth(), height = 170.dp)
        DriverSkeleton(Modifier.fillMaxWidth(0.3f), height = 14.dp)
        repeat(3) { DriverSkeleton(Modifier.fillMaxWidth(), height = 64.dp) }
    }
}

/** "Go off duty?" — names the work still held, so nobody walks away from a van of parcels unaware. */
@Composable
private fun GoOffDutySheet(today: Today?, hub: String?, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val held = today?.remainingCount ?: 0
    val toReturn = today?.toReturn?.count ?: 0
    val run = when (today?.phase) {
        Phase.COLLECTION -> "this collection run"
        Phase.DELIVERY -> "this delivery run"
        else -> "your run"
    }
    DriverSheet(
        title = "Go off duty?",
        description = when {
            held > 0 -> "You still have $held ${if (held == 1) "stop" else "stops"} on $run. Dispatch will be told, and may give the run to someone else."
            else -> "You won't be given new work until you go back on duty."
        },
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
