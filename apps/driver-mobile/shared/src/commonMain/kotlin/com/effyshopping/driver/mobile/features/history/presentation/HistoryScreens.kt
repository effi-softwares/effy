package com.effyshopping.driver.mobile.features.history.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.effyshopping.driver.mobile.core.platform.localDateIso
import com.effyshopping.driver.mobile.core.presentation.DriverDetailRow
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverLargeTitleBar
import com.effyshopping.driver.mobile.core.presentation.DriverRow
import com.effyshopping.driver.mobile.core.presentation.DriverSectionLabel
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.presentation.DriverSkeleton
import com.effyshopping.driver.mobile.core.presentation.DriverState
import com.effyshopping.driver.mobile.core.presentation.DriverStatus
import com.effyshopping.driver.mobile.core.presentation.DriverStatusPill
import com.effyshopping.driver.mobile.core.presentation.dayText
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis
import com.effyshopping.driver.mobile.core.presentation.timeText
import com.effyshopping.driver.mobile.core.presentation.whenText
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.features.history.domain.HistoryDay
import com.effyshopping.driver.mobile.features.history.domain.ProofRecord
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_check
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_history
import com.effyshopping.driver.mobile.resources.lucide_store
import com.effyshopping.driver.mobile.resources.lucide_truck

/** History (canvas `History`): what the driver finished, by day. Counts only, never money. */
@Composable
fun HistoryScreen(
    state: HistoryUiState,
    onOpenDrop: (String) -> Unit,
    onOpenRun: (runId: String, title: String) -> Unit,
    onRefresh: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        DriverLargeTitleBar("History")
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            val history = state.history
            when {
                history == null && state.isLoading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DriverSkeleton(Modifier.fillMaxWidth(0.4f)); repeat(4) { DriverSkeleton(Modifier.fillMaxWidth(), height = 64.dp) }
                }
                history == null -> DriverState(
                    Res.drawable.lucide_circle_alert, "Your history didn't load", state.message ?: "That's on us. Check your signal and try again.",
                    actionLabel = "Try again", onAction = onRefresh,
                )
                history.days.isEmpty() -> DriverState(
                    Res.drawable.lucide_history, "Nothing finished yet", "Runs and deliveries you finish show here for 30 days.",
                )
                else -> {
                    Text("What you've finished in the last 30 days. Counts only.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    history.days.forEach { day -> Day(day, onOpenDrop, onOpenRun) }
                }
            }
        }
    }
}

@Composable
private fun Day(day: HistoryDay, onOpenDrop: (String) -> Unit, onOpenRun: (String, String) -> Unit) {
    val today = localDateIso(nowEpochMillis())
    Column {
        Row(Modifier.padding(bottom = 8.dp), verticalAlignment = Alignment.Bottom) {
            Text(
                (if (day.date == today) "Today · " else "") + dayText(day.date),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.weight(1f),
            )
            Text(
                listOfNotNull(
                    day.runs.size.takeIf { it > 0 }?.let { if (it == 1) "1 run" else "$it runs" },
                    day.drops.size.takeIf { it > 0 }?.let { "$it delivered" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        DriverGroup {
            val rows = day.drops.size + day.runs.size
            var i = 0
            day.drops.forEach { d ->
                i++
                DriverRow(
                    title = listOf(d.customerSuburb, d.orderRef).filter { it.isNotBlank() }.joinToString(" · "),
                    meta = timeText(d.completedAt),
                    last = i == rows,
                    onClick = { onOpenDrop(d.dropId) },
                    leading = { Circle(done = true) },
                    trailing = { if (d.proofCaptured) DriverStatusPill(DriverStatus.Delivered, label = "Proof") },
                )
            }
            day.runs.forEach { r ->
                i++
                val title = if (r.type == "collection") "Collection run" else "Delivery run"
                DriverRow(
                    title = title,
                    meta = listOfNotNull(
                        if (r.type == "collection") (if (r.stopCount == 1) "1 shop" else "${r.stopCount} shops") else (if (r.stopCount == 1) "1 drop" else "${r.stopCount} drops"),
                        r.completedAt?.let { "done ${timeText(it)}" },
                    ).joinToString(" · "),
                    last = i == rows,
                    onClick = { onOpenRun(r.runId, title) },
                    leading = {
                        Box(Modifier.size(32.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                            DriverIcon(if (r.type == "collection") Res.drawable.lucide_store else Res.drawable.lucide_truck, size = 16.dp)
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun Circle(done: Boolean) {
    Box(
        Modifier.size(32.dp).clip(CircleShape).background(if (done) EffyRoles.brandMuted else MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) { DriverIcon(Res.drawable.lucide_check, size = 16.dp, tint = if (done) EffyRoles.brand else MaterialTheme.colorScheme.onSurface) }
}

/**
 * A past record (canvas `HistoryRun`, `HistoryDrop`). ⚠ The proof photo is shown — it is what the
 * driver needs when a customer says the parcel never came. A run has no proof section.
 */
@Composable
fun HistoryDetailScreen(state: HistoryUiState, title: String, kind: String, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar(title, backLabel = "History", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            val detail = state.detail
            when {
                detail == null && state.isLoading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DriverSkeleton(Modifier.fillMaxWidth(0.6f), height = 28.dp); DriverSkeleton(Modifier.fillMaxWidth(), height = 200.dp)
                }
                detail == null -> DriverState(Res.drawable.lucide_circle_alert, "This record didn't load", state.message ?: "That's on us. Try again in a moment.")
                else -> {
                    if (kind != "run") DriverStatusPill(if (detail.proof != null) DriverStatus.Delivered else DriverStatus.NotDelivered)
                    detail.addressFull?.let { Text(it, fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold) }
                    detail.timeline.lastOrNull()?.let {
                        Text(whenText(it.at), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (kind != "run") detail.proof?.let { Proof(it) }
                    if (kind == "run" && detail.timeline.isNotEmpty()) {
                        Column {
                            DriverSectionLabel("Timeline")
                            DriverGroup {
                                detail.timeline.forEachIndexed { i, e ->
                                    DriverDetailRow(e.status.replace('_', ' ').replaceFirstChar { c -> c.uppercase() }, whenText(e.at), last = i == detail.timeline.lastIndex)
                                }
                            }
                        }
                    }
                    Text("Kept so you can answer \"where did you leave it?\" — read only.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun Proof(proof: ProofRecord) {
    val (leftAt, note) = splitNote(proof.note)
    Column {
        DriverSectionLabel("Proof")
        proof.mediaUrl?.let { url ->
            AsyncImage(
                model = url,
                contentDescription = "The ${proof.method} proof for this delivery",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(EffyStorefrontShape.card).background(MaterialTheme.colorScheme.surfaceVariant),
            )
        }
        DriverGroup(Modifier.padding(top = 12.dp)) {
            DriverDetailRow("Method", methodWords(proof.method), last = leftAt == null && note == null)
            leftAt?.let { DriverDetailRow("Left at", it, last = note == null) }
            note?.let { DriverDetailRow("Your note", it, last = true) }
        }
    }
}

private fun methodWords(method: String): String = when (method) {
    "contactless" -> "Photo · left safely"
    "photo" -> "Photo · handed over"
    "signature" -> "Signature"
    else -> method.replaceFirstChar { it.uppercase() }
}

/** The proof note as written by the app: "Left at: Front door — the driver's words". */
internal fun splitNote(note: String?): Pair<String?, String?> {
    val text = note?.trim()?.takeIf { it.isNotEmpty() } ?: return null to null
    if (!text.startsWith("Left at: ")) return null to text
    val rest = text.removePrefix("Left at: ")
    val parts = rest.split(" — ", limit = 2)
    return parts[0] to parts.getOrNull(1)?.takeIf { it.isNotBlank() }
}

