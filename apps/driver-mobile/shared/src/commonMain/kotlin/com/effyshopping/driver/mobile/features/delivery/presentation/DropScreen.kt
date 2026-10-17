package com.effyshopping.driver.mobile.features.delivery.presentation

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.presentation.DriverActionBar
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.presentation.DriverSkeleton
import com.effyshopping.driver.mobile.core.presentation.DriverState
import com.effyshopping.driver.mobile.core.presentation.DriverStatus
import com.effyshopping.driver.mobile.core.presentation.DriverStatusPill
import com.effyshopping.driver.mobile.core.presentation.rememberIsOpen
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropPackage
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import com.effyshopping.driver.mobile.features.delivery.domain.Handover
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.features.manifest.presentation.LocalManifestOpened
import com.effyshopping.driver.mobile.features.manifest.presentation.ManifestList
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_chevron_down
import com.effyshopping.driver.mobile.resources.lucide_chevron_up
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_clock
import com.effyshopping.driver.mobile.resources.lucide_door_open
import com.effyshopping.driver.mobile.resources.lucide_hand
import com.effyshopping.driver.mobile.resources.lucide_navigation
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_phone
import com.effyshopping.driver.mobile.resources.lucide_snowflake
import com.effyshopping.driver.mobile.resources.lucide_house
import com.effyshopping.driver.mobile.resources.lucide_scan_line
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.core.scan.HandedOver
import com.effyshopping.driver.mobile.core.scan.ScanContext
import com.effyshopping.driver.mobile.core.scan.ScanContexts
import com.effyshopping.driver.mobile.core.scan.ScanItem
import com.effyshopping.driver.mobile.core.scan.ScanPanel

/** Where the driver is within one drop. Saved, so a rotation or a trip to the camera keeps the place. */
internal enum class DropStage { Detail, Scan, Choose, Camera, Review, Signature, CantDeliver }

/**
 * One drop (canvas `Drop` and its proof, outcome and can't-deliver screens). Two taps: Deliver opens
 * "how did you hand it over?", and completing the proof is the second (092, R5 — arrival is recorded
 * silently by the ViewModel).
 */
@Composable
fun DropScreen(
    state: DeliveryUiState,
    hubName: String?,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    onCall: (String) -> Unit,
    onDeliver: (ProofMethod, ByteArray, String?, List<HandedOver>) -> Unit,
    onFail: (FailureReason, String?) -> Unit,
    onNext: () -> Unit,
    onBackToRun: () -> Unit,
    onRetry: () -> Unit,
    onCameraDenied: () -> Unit,
    onCallDispatch: (() -> Unit)?,
    startScanning: Boolean = false,
) {
    val drop = state.drop
    if (drop == null) {
        Column(Modifier.fillMaxSize()) {
            DriverInlineBar("Drop", backLabel = "Run", onBack = onBack)
            Column(Modifier.padding(DriverSize.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (state.isLoading) {
                    DriverSkeleton(Modifier.fillMaxWidth(0.4f))
                    DriverSkeleton(Modifier.fillMaxWidth(0.8f), height = 32.dp)
                    DriverSkeleton(Modifier.fillMaxWidth(), height = 120.dp)
                } else {
                    DriverState(
                        Res.drawable.lucide_circle_alert, "This drop didn't load", state.message ?: "That's on us. Check your signal and try again.",
                        actionLabel = "Try again", onAction = onRetry,
                    )
                }
            }
        }
        return
    }
    val run = state.run
    val position = run?.drops?.firstOrNull { it.dropId == drop.dropId }?.sequence
    val next = run?.drops?.filter { it.dropId != drop.dropId && !it.status.isClosed }?.minByOrNull { it.sequence }
    val runDone = run?.let { r -> r.drops.count { it.status.isClosed || it.dropId == drop.dropId } } ?: 0
    val runTotal = run?.drops?.size ?: 0

    when {
        state.delivered -> DeliveredView(drop, state, next?.let { it.street ?: it.customerSuburb }, runDone, runTotal, onNext = onNext, onBackToRun = onBackToRun)
        state.failed -> NotDeliveredView(drop, state, hubName, next?.let { it.street ?: it.customerSuburb }, onNext = onNext, onBackToRun = onBackToRun, onCallDispatch = onCallDispatch)
        drop.status.isClosed -> ClosedView(drop, onBack)
        else -> OpenDrop(drop, state, position, runTotal, onBack, onNavigate, onCall, onDeliver, onFail, onCameraDenied, startScanning, onBackToRun)
    }
}

@Composable
private fun OpenDrop(
    drop: Drop,
    state: DeliveryUiState,
    position: Int?,
    runTotal: Int,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    onCall: (String) -> Unit,
    onDeliver: (ProofMethod, ByteArray, String?, List<HandedOver>) -> Unit,
    onFail: (FailureReason, String?) -> Unit,
    onCameraDenied: () -> Unit,
    startScanning: Boolean,
    onBackToRun: () -> Unit,
) {
    val canScan = drop.packages.any { it.packageCode != null }
    var stage by rememberSaveable(drop.dropId) {
        // 093 — never straight to the door scan for a drop that is still at the hub.
        mutableStateOf(if (startScanning && canScan && drop.loaded && rememberIsOpenNow(drop)) DropStage.Scan else DropStage.Detail)
    }
    var method by rememberSaveable(drop.dropId) {
        mutableStateOf(if (drop.handover == Handover.MeetAtDoor) ProofMethod.PHOTO else ProofMethod.CONTACTLESS)
    }
    var photo by remember(drop.dropId) { mutableStateOf<ByteArray?>(null) }
    // 092 — how each bag was handed over at the door, from the scan; kept for the proof.
    var handed by remember(drop.dropId) { mutableStateOf<List<HandedOver>>(emptyList()) }
    val open = rememberIsOpen(drop.opening)
    val title = if (position != null && runTotal > 0) "Drop $position of $runTotal" else "Drop"

    when (stage) {
        DropStage.Scan -> {
            val run = state.run
            val base = if (run != null) ScanContexts.drop(run, drop) else ScanContext(drop.packages.mapNotNull { it.packageCode }.toSet())
            val street = splitAddress(drop.addressFull).first
            val n = drop.packages.size
            ScanPanel(
                title = street, backLabel = "Drop",
                context = base,
                items = drop.packages.mapIndexedNotNull { i, p ->
                    p.packageCode?.let {
                        ScanItem(
                            it, "Package ${i + 1} of $n",
                            meta = listOfNotNull(itemWords(p.summary.total.takeIf { it > 0 } ?: p.items.sumOf { it.qty }), "cold".takeIf { p.summary.hasCold }).joinToString(" · "),
                            bannerTitle = "Package ${i + 1} of $n", bannerSub = "For $street",
                        )
                    }
                },
                listTitle = { s, t -> "Packages · $s of $t scanned" },
                idleSub = "$street · ${packages(n)}",
                completeVerb = "handing over",
                working = false,
                onBack = { stage = DropStage.Detail },
                onComplete = { h -> handed = h; stage = DropStage.Choose },
                fallbackLabel = "Deliver without scanning",
                onFallback = { handed = emptyList(); stage = DropStage.Choose },
                secondaryLabel = "Can't deliver",
                onSecondary = { stage = DropStage.CantDeliver },
                footer = {
                    val note = listOfNotNull(
                        when (drop.handover) { Handover.LeaveAtDoor -> "Leave at the door"; Handover.MeetAtDoor -> "Hand it over in person"; null -> null },
                        drop.instructions?.trim()?.takeIf { it.isNotEmpty() },
                    ).joinToString(" · ")
                    if (note.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            DriverIcon(Res.drawable.lucide_house, size = 18.dp, tint = MaterialTheme.colorScheme.primary)
                            Text(note, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                },
            )
        }
        DropStage.Camera -> ProofCamera(
            method = method,
            onClose = { stage = DropStage.Detail },
            onCaptured = { photo = it; stage = DropStage.Review },
            onDenied = { stage = DropStage.Detail; onCameraDenied() },
        )
        DropStage.Review -> {
            val bytes = photo
            if (bytes == null) {
                // The photo is not kept across the app being reclaimed: take it again.
                androidx.compose.runtime.LaunchedEffect(Unit) { stage = DropStage.Camera }
            } else {
                ProofReview(
                    drop = drop, method = method, photo = bytes, working = state.isWorking, message = state.message,
                    onRetake = { stage = DropStage.Camera },
                    onComplete = { note -> onDeliver(method, bytes, note, handed) },
                )
            }
        }
        DropStage.Signature -> ProofSignatureScreen(
            drop = drop, working = state.isWorking, message = state.message,
            onBack = { stage = DropStage.Detail },
            onComplete = { png, note -> onDeliver(ProofMethod.SIGNATURE, png, note, handed) },
        )
        DropStage.CantDeliver -> CantDeliverScreen(
            drop = drop, working = state.isWorking, message = state.message,
            onBack = { stage = DropStage.Detail },
            onCall = drop.customerPhone?.let { phone -> { onCall(phone) } },
            onRecord = onFail,
        )
        DropStage.Detail, DropStage.Choose -> {
            DropDetail(drop, title, open, state.message, onBack, onNavigate, onCall,
                onDeliver = { stage = if (canScan) DropStage.Scan else DropStage.Choose },
                onCantDeliver = { stage = DropStage.CantDeliver },
                onLoadVan = onBackToRun,
            )
            if (stage == DropStage.Choose) {
                ProofChooser(
                    drop = drop,
                    selected = method,
                    onSelect = { method = it },
                    onContinue = {
                        stage = if (method == ProofMethod.SIGNATURE) DropStage.Signature else DropStage.Camera
                    },
                    onDismiss = { stage = DropStage.Detail },
                )
            }
        }
    }
}

@Composable
private fun DropDetail(
    drop: Drop,
    title: String,
    open: Boolean,
    message: String?,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    onCall: (String) -> Unit,
    onDeliver: () -> Unit,
    onCantDeliver: () -> Unit,
    /** 093 — to the run, where the van is loaded. */
    onLoadVan: () -> Unit,
) {
    val (street, rest) = splitAddress(drop.addressFull)
    val firstName = drop.customerName.trim().substringBefore(' ').ifBlank { null }
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar(title, backLabel = "Run", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            if (drop.stale) {
                Text("Last loaded copy — changes since then won't show.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val now = rememberNow()
                val ws = windowStatus(drop.window, drop.status, now)
                if (ws != null || drop.window != null) {
                    // The window as two pills: its state (Due now — blue while it's the time) and its hours.
                    Row(Modifier.padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        ws?.let { if (it == DriverStatus.DueNow) DriverStatusPill(DriverStatus.Next, label = "Due now") else DriverStatusPill(it) }
                        drop.window?.let { w ->
                            Text(
                                w.label,
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                                modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control).padding(horizontal = 9.dp, vertical = 4.dp),
                            )
                        }
                    }
                }
                Text(street, fontSize = 32.sp, lineHeight = 38.sp, fontWeight = FontWeight.Bold)
                Text(
                    listOfNotNull(rest, firstName?.let { "for $it" }).joinToString(" · "),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                DriverButton("Navigate", onClick = { onNavigate(drop.addressFull) }, style = DriverButtonStyle.Outline, icon = Res.drawable.lucide_navigation, tall = false, modifier = Modifier.weight(1f))
                drop.customerPhone?.let { phone ->
                    DriverButton(firstName?.let { "Call $it" } ?: "Call", onClick = { onCall(phone) }, style = DriverButtonStyle.Outline, icon = Res.drawable.lucide_phone, tall = false, modifier = Modifier.weight(1f))
                }
            }
            InstructionCallout(drop)
            PackagesList(drop)
            Text(
                "Order ${drop.orderRef}" + if (drop.packages.size > 1) " · hand over all ${drop.packages.size} together." else ".",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        DriverActionBar {
            val opening = drop.opening
            if (!open && opening != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    DriverIcon(Res.drawable.lucide_clock, size = 14.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Not open yet · ${opening.sentence}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (!drop.loaded) {
                // 093 — the drop is still at the hub: loading the van is the next step, not this drop.
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    DriverIcon(Res.drawable.lucide_truck, size = 14.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Load the van first — then this drop opens.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                DriverButton("Go to Load the van", onClick = onLoadVan, icon = Res.drawable.lucide_truck, modifier = Modifier.fillMaxWidth())
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    DriverButton("Can't deliver", onClick = onCantDeliver, style = DriverButtonStyle.Outline, enabled = open, modifier = Modifier.weight(1f))
                    DriverButton(
                        if (drop.packages.any { it.packageCode != null }) "Scan to deliver" else "Deliver",
                        onClick = onDeliver, enabled = open, icon = Res.drawable.lucide_scan_line, modifier = Modifier.weight(1.5f),
                    )
                }
            }
        }
    }
}

/** What the customer asked: how to hand it over, and their note, verbatim (066). Nothing when they said nothing. */
@Composable
private fun InstructionCallout(drop: Drop) {
    val note = drop.instructions?.trim()?.takeIf { it.isNotEmpty() }
    if (drop.handover == null && note == null) return
    val shape = EffyStorefrontShape.card
    Row(
        Modifier.fillMaxWidth().clip(EffyStorefrontShape.banner).background(EffyRoles.primaryMuted).padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        DriverIcon(
            if (drop.handover == Handover.MeetAtDoor) Res.drawable.lucide_hand else Res.drawable.lucide_house,
            size = 20.dp, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 2.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            drop.handover?.let { h ->
                Text(if (h == Handover.LeaveAtDoor) "Leave at the door" else "Hand it over in person", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
            }
            note?.let {
                Text("“$it”", style = MaterialTheme.typography.bodyLarge, fontStyle = FontStyle.Normal)
                Text("From the customer", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** The packages by position — never by shop (hidden fulfilment), each opening to its items. */
@Composable
private fun PackagesList(drop: Drop) {
    val n = drop.packages.size
    if (n == 0) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(packages(n), fontSize = 26.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            val items = drop.summary.total
            Text(
                listOfNotNull(
                    if (items == 1) "1 item" else "$items items",
                    if (drop.summary.hasCold) "${drop.summary.frozen + drop.summary.chilled} cold" else null,
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        val shape = EffyStorefrontShape.banner
        Column(Modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)) {
            drop.packages.forEachIndexed { i, p -> PackageRow(drop.dropId, p, i + 1, n, last = i == n - 1) }
        }
    }
}

@Composable
private fun PackageRow(dropId: String, p: DropPackage, position: Int, of: Int, last: Boolean) {
    var open by rememberSaveable("$dropId-$position") { mutableStateOf(position == 1) }
    val report = LocalManifestOpened.current
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button) {
                    open = !open
                    if (open) report(p.summary.hasCold, p.items.size)
                }
                .semantics { stateDescription = if (open) "Expanded" else "Collapsed" }
                .heightIn(min = 60.dp)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Package $position of $of", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
            Text(itemWords(p.summary.total.takeIf { it > 0 } ?: p.items.sumOf { it.qty }), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (p.summary.hasCold) {
                Row(
                    Modifier.clip(EffyStorefrontShape.control).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 8.dp, vertical = 3.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically,
                ) {
                    DriverIcon(Res.drawable.lucide_snowflake, size = 12.dp)
                    Text("Cold", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold))
                }
            }
            Box(Modifier.weight(1f))
            DriverIcon(if (open) Res.drawable.lucide_chevron_up else Res.drawable.lucide_chevron_down, size = 18.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (open) com.effyshopping.driver.mobile.features.manifest.presentation.ManifestBox(p.items, Modifier.padding(horizontal = 16.dp).padding(bottom = 14.dp))
        if (!last) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/** A drop already finished before this screen opened — from history, or another phone. */
@Composable
private fun ClosedView(drop: Drop, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Drop", backLabel = "Run", onBack = onBack)
        Column(Modifier.padding(DriverSize.gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DriverStatusPill(if (drop.status == DropStatus.DELIVERED) DriverStatus.Delivered else DriverStatus.NotDelivered)
            Text(splitAddress(drop.addressFull).first, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text(
                if (drop.status == DropStatus.DELIVERED) "This drop is done." else "Recorded as not delivered. Its parcels go back to the hub.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Box(Modifier.weight(1f))
    }
}

/** Whether the drop's round is open right now (a one-off check for the starting stage). */
private fun rememberIsOpenNow(drop: Drop): Boolean =
    drop.opening?.isOpenAt(com.effyshopping.driver.mobile.core.presentation.nowEpochMillis()) ?: true

private fun itemWords(n: Int) = if (n == 1) "1 item" else "$n items"
