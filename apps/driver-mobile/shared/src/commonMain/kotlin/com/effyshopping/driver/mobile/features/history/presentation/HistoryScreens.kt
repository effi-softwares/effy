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
import com.effyshopping.driver.mobile.core.presentation.DriverNumberCircle
import com.effyshopping.driver.mobile.core.presentation.DriverSectionLabel
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.presentation.DriverDetailSkeleton
import com.effyshopping.driver.mobile.core.presentation.DriverHistorySkeleton
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
import com.effyshopping.driver.mobile.features.history.domain.HistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.HistoryDropRow
import com.effyshopping.driver.mobile.features.history.domain.HistoryRunRow
import com.effyshopping.driver.mobile.core.map.RunMapView
import com.effyshopping.driver.mobile.core.presentation.isoToMillis
import androidx.compose.foundation.layout.width
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import com.effyshopping.driver.mobile.resources.lucide_camera
import com.effyshopping.driver.mobile.resources.lucide_chevron_right
import com.effyshopping.driver.mobile.resources.lucide_circle_x
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
                history == null && state.isLoading -> DriverHistorySkeleton()
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
    val now = nowEpochMillis()
    val prefix = when (day.date) {
        localDateIso(now) -> "Today · "
        localDateIso(now - 86_400_000L) -> "Yesterday · "
        else -> ""
    }
    val delivered = day.drops.count { it.failureReason == null }
    val returned = day.drops.size - delivered
    Column {
        Row(Modifier.padding(bottom = 8.dp), verticalAlignment = Alignment.Bottom) {
            Text(
                prefix + dayText(day.date),
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Text(
                listOfNotNull(
                    day.runs.size.takeIf { it > 0 }?.let { if (it == 1) "1 run" else "$it runs" },
                    delivered.takeIf { it > 0 }?.let { "$it delivered" },
                    returned.takeIf { it > 0 }?.let { "$it returned" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        DriverGroup {
            // Newest first, drops and runs together - the canvas interleaves them by time.
            val entries = (day.drops.map { it.completedAt to it } + day.runs.map { (it.completedAt ?: "") to it })
                .sortedByDescending { it.first }
                .map { it.second }
            entries.forEachIndexed { i, e ->
                val last = i == entries.lastIndex
                when (e) {
                    is HistoryDropRow -> {
                        val came = e.failureReason != null
                        DriverRow(
                            title = listOfNotNull(e.street, e.customerSuburb.takeIf { it.isNotBlank() }).joinToString(", ").ifBlank { e.orderRef },
                            meta = listOfNotNull(timeText(e.completedAt), if (came) failureWords(e.failureReason) else e.proofMethod?.let(::methodShort)).joinToString(" · "),
                            last = last,
                            onClick = { onOpenDrop(e.dropId) },
                            leading = { RowIcon(if (came) RowLook.Returned else RowLook.Done) },
                            trailing = {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    when {
                                        came -> DriverStatusPill(DriverStatus.NotDelivered, label = "Returned", showIcon = false)
                                        e.proofCaptured -> DriverStatusPill(DriverStatus.Delivered, label = "Proof", showIcon = false)
                                    }
                                    Chevron()
                                }
                            },
                        )
                    }
                    is HistoryRunRow -> {
                        val collection = e.type == "collection"
                        val title = if (collection) "Collection run" else "Delivery run"
                        DriverRow(
                            title = title,
                            meta = listOfNotNull(
                                if (collection) null else e.window,
                                if (collection) (if (e.stopCount == 1) "1 shop" else "${e.stopCount} shops") else (if (e.stopCount == 1) "1 drop" else "${e.stopCount} drops"),
                                if (collection) e.packageCount.takeIf { it > 0 }?.let { if (it == 1) "1 package" else "$it packages" } else null,
                                e.completedAt?.let { "done ${timeText(it)}" },
                            ).joinToString(" · "),
                            last = last,
                            onClick = { onOpenRun(e.runId, title) },
                            leading = { RowIcon(RowLook.Run) },
                            trailing = { Chevron() },
                        )
                    }
                }
            }
        }
    }
}

private enum class RowLook { Done, Returned, Run }

@Composable
private fun RowIcon(look: RowLook) {
    val done = look == RowLook.Done
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(if (done) EffyRoles.brandMuted else MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        DriverIcon(
            when (look) {
                RowLook.Done -> Res.drawable.lucide_check
                RowLook.Returned -> Res.drawable.lucide_circle_x
                RowLook.Run -> Res.drawable.lucide_truck
            },
            size = 18.dp,
            tint = if (done) EffyRoles.brand else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun Chevron() = DriverIcon(Res.drawable.lucide_chevron_right, size = 18.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)

/**
 * A past record (canvas `HistoryRun`, `HistoryDrop`). The proof photo is shown - it is what the
 * driver needs when a customer says the parcel never came. A run has no proof section.
 */
@Composable
fun HistoryDetailScreen(
    state: HistoryUiState,
    title: String,
    kind: String,
    onBack: () -> Unit,
    onOpenDrop: (String) -> Unit = {},
    hubName: String? = null,
) {
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar(title, backLabel = "History", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            val detail = state.detail
            when {
                detail == null && state.isLoading -> DriverDetailSkeleton("Proof", label = "Loading the record")
                detail == null -> DriverState(Res.drawable.lucide_circle_alert, "This record didn't load", state.message ?: "That's on us. Try again in a moment.")
                kind == "run" -> PastRun(detail, title, hubName, onOpenDrop)
                else -> PastDrop(detail)
            }
        }
    }
}

@Composable
private fun PastRun(detail: HistoryDetail, title: String, hubName: String?, onOpenDrop: (String) -> Unit) {
    val at = detail.timeline.lastOrNull()?.at
    val drops = detail.stops.any { it.kind == "drop" }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            listOfNotNull(at?.let { dayOf(it) }, hubName?.let { if (drops) "from $it" else "ended at $it" }).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(detail.window ?: title, fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.SemiBold)
        val delivered = detail.stops.count { it.kind == "drop" && it.done }
        val returned = detail.stops.count { it.kind == "drop" && !it.done }
        val shops = detail.stops.count { it.kind == "shop" }
        val bold = SpanStyle(fontWeight = FontWeight.SemiBold)
        Text(
            buildAnnotatedString {
                at?.let { append("Done ${timeText(it)}") }
                fun part(n: Int, words: String) {
                    if (n <= 0) return
                    if (length > 0) append(" · ")
                    withStyle(bold) { append("$n") }; append(" $words")
                }
                part(shops, if (shops == 1) "shop" else "shops")
                part(delivered, "delivered")
                part(returned, "returned to hub")
            },
            style = MaterialTheme.typography.bodyLarge,
        )
    }
    detail.map?.let { map ->
        RunMapView(
            map, seed = title + (at ?: ""),
            description = "Map of this finished run - every stop done.",
            height = 170.dp, animate = false,
        )
    }
    if (detail.stops.isNotEmpty()) Column {
        DriverSectionLabel(if (drops) "Drops" else "Stops")
        DriverGroup {
            detail.stops.forEachIndexed { i, s ->
                DriverRow(
                    title = s.title,
                    meta = listOfNotNull(
                        s.completedAt?.let { timeText(it) },
                        if (s.failureReason != null) failureWords(s.failureReason) else s.proofMethod?.let(::methodShort),
                    ).joinToString(" · ").ifBlank { null },
                    last = i == detail.stops.lastIndex,
                    onClick = if (s.kind == "drop") ({ onOpenDrop(s.stopId) }) else null,
                    leading = {
                        Text(
                            "${s.sequence}", modifier = Modifier.width(20.dp),
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    trailing = {
                        val status = when {
                            s.kind == "drop" && s.done -> DriverStatus.Delivered
                            s.kind == "drop" -> DriverStatus.NotDelivered
                            s.kind == "hub" -> DriverStatus.CheckedIn
                            s.done -> DriverStatus.Collected
                            else -> DriverStatus.Short
                        }
                        DriverStatusPill(status, label = if (status == DriverStatus.NotDelivered) "Returned" else status.word, showIcon = false)
                    },
                )
            }
        }
    }
}

@Composable
private fun PastDrop(detail: HistoryDetail) {
    val came = detail.failureReason != null || detail.proof == null
    val at = detail.timeline.lastOrNull()?.at
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        DriverStatusPill(if (came) DriverStatus.NotDelivered else DriverStatus.Delivered, label = if (came) "Returned" else DriverStatus.Delivered.word)
        detail.addressFull?.let { Text(it, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.SemiBold) }
        Text(
            listOfNotNull(at?.let { "${dayOf(it)} · ${timeText(it)}" }, detail.window?.let { "window $it" }).joinToString(" · "),
            style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    detail.proof?.let { Proof(it, detail.packageCount) }
    if (came) DriverGroup {
        DriverDetailRow("What happened", detail.failureReason?.let { failureWords(it).replaceFirstChar { c -> c.uppercase() } } ?: "Not delivered", last = detail.packageCount <= 0)
        if (detail.packageCount > 0) DriverDetailRow("Packages", "${detail.packageCount} · back at the hub", last = true)
    }
    Text(
        listOfNotNull(
            detail.orderRef?.let { "Order $it." },
            if (detail.proof != null) "Kept so you can answer \"where did you leave it?\" - the customer sees the same photo." else "Kept so you can answer what happened - read only.",
        ).joinToString(" "),
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun Proof(proof: ProofRecord, packageCount: Int) {
    val (leftAt, note) = splitNote(proof.note)
    Column {
        DriverSectionLabel("Proof")
        val box = Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(EffyStorefrontShape.banner).background(MaterialTheme.colorScheme.surfaceVariant)
        if (proof.mediaUrl != null) {
            AsyncImage(
                model = proof.mediaUrl,
                contentDescription = "The ${proof.method} proof for this delivery",
                contentScale = ContentScale.Crop,
                modifier = box,
            )
        } else {
            Column(box, verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                DriverIcon(Res.drawable.lucide_camera, size = 32.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("No photo with this one", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
        }
        DriverGroup(Modifier.padding(top = 20.dp)) {
            DriverDetailRow("Method", methodWords(proof.method), last = leftAt == null && note == null && packageCount <= 0)
            leftAt?.let { DriverDetailRow("Left at", it, last = note == null && packageCount <= 0) }
            if (packageCount > 0) DriverDetailRow("Packages", "$packageCount", last = note == null)
            note?.let {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                    Text("Your note", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(it, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
                }
            }
        }
    }
}

/** The meta line's short form: "photo", "photo, left safely", "signature". */
private fun methodShort(method: String): String = when (method) {
    "contactless" -> "photo, left safely"
    else -> method
}

/** Why a drop came back, from the wire's word. */
private fun failureWords(reason: String): String = when (reason) {
    "nobody_home" -> "nobody home"
    "wrong_address" -> "wrong address"
    "customer_refused" -> "customer refused it"
    "access_blocked" -> "couldn't get in"
    else -> "not delivered"
}

/** "Wed 14 Oct" for an ISO instant, in the device's day. */
private fun dayOf(iso: String): String = isoToMillis(iso)?.let { dayText(localDateIso(it)) } ?: ""

private fun methodWords(method: String): String = when (method) {
    "contactless" -> "Photo · left safely"
    "photo" -> "Photo · handed over"
    "signature" -> "Signature"
    else -> method.replaceFirstChar { it.uppercase() }
}

/** The proof note as written by the app: "Left at: Front door - the driver's words". */
internal fun splitNote(note: String?): Pair<String?, String?> {
    val text = note?.trim()?.takeIf { it.isNotEmpty() } ?: return null to null
    if (!text.startsWith("Left at: ")) return null to text
    val rest = text.removePrefix("Left at: ")
    val parts = rest.split(" - ", limit = 2)
    return parts[0] to parts.getOrNull(1)?.takeIf { it.isNotBlank() }
}

