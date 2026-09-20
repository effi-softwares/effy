package com.effyshopping.driver.mobile.features.history.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import com.effyshopping.driver.mobile.features.history.domain.ProofRecord
import coil3.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** History list — completed runs + drops grouped by day, read-only (FR-033). */
@Composable
fun HistoryScreen(state: HistoryUiState, onOpenDrop: (String) -> Unit, onOpenRun: (String) -> Unit) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(20.dp)) {
        Text("History", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(12.dp))
        when {
            state.isLoading && state.history == null -> Centered { CircularProgressIndicator() }
            state.isEmpty -> Centered { Text("No completed work yet.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            state.history == null -> Centered { Text(state.message ?: "Couldn't load history.") }
            else -> Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                state.history.days.forEach { day ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(day.date, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        day.runs.forEach { run ->
                            RecordRow(
                                title = if (run.type == "collection") "Collection run" else "Same-day run",
                                subtitle = "${run.stopCount} stop(s)",
                                trailing = null,
                                onClick = { onOpenRun(run.runId) },
                            )
                        }
                        day.drops.forEach { drop ->
                            RecordRow(
                                title = drop.orderRef,
                                subtitle = drop.customerSuburb,
                                trailing = if (drop.proofCaptured) "proof ✓" else null,
                                onClick = { onOpenDrop(drop.dropId) },
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * A past record (060 US7, design screens `history-run` / `history-detail`).
 *
 * \u26a0 **The proof PHOTO is now rendered.** 049 printed the words "Photo/signature captured" and
 * showed nothing \u2014 useless in the single situation this record exists for, which is a customer
 * saying the parcel never arrived.
 *
 * \u26a0 A collection run and a same-day drop get **different** layouts. They were sharing one
 * generic body, so a run's record showed a "Proof" heading it can never have.
 */
@Composable
fun HistoryDetailScreen(state: HistoryUiState, title: String, kind: String, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(20.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("\u2039 Back") }
            Spacer(Modifier.width(4.dp))
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        }
        val detail = state.detail
        when {
            state.isLoading && detail == null -> Centered { CircularProgressIndicator() }
            detail == null -> Centered { Text(state.message ?: "Couldn't load the record.") }
            else -> Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                detail.addressFull?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                // \u26a0 A drop can have proof; a collection run cannot. Showing the section for a run
                // would imply a record type that does not exist.
                if (kind != "run") {
                    detail.proof?.let { ProofRecordBlock(it) }
                }

                SectionLabel("Timeline")
                detail.timeline.forEach { entry ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = MaterialTheme.colorScheme.primary, shape = CircleShape, modifier = Modifier.size(8.dp)) {}
                        Spacer(Modifier.width(10.dp))
                        Text(
                            entry.status.replace('_', ' ').replaceFirstChar { c -> c.uppercase() },
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            entry.at.take(19).replace('T', ' '),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Text(
                    "Read-only record.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ProofRecordBlock(proof: ProofRecord) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("Proof")
        proof.mediaUrl?.let { url ->
            AsyncImage(
                model = url,
                // \u26a0 A real description: a screen reader user reviewing a disputed delivery needs
                // to know an image is the evidence, not that "an image" exists.
                contentDescription = "Captured ${proof.method} proof for this delivery",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(12.dp)),
            )
        }
        Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    proof.method.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    proof.capturedAt.take(19).replace('T', ' '),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                proof.note?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                }
                // \u26a0 The design shows "geotagged Brunswick VIC". No location capture is wired, and
                // a WRONG geotag on a delivery record is evidence in a dispute \u2014 omitted (FR-015).
            }
        }
    }
}

@Composable
private fun RecordRow(title: String, subtitle: String, trailing: String?, onClick: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            trailing?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { content() }
}
