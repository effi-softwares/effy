package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import com.effyshopping.mobile.kit.ui.SkeletonSquare
import com.effyshopping.mobile.kit.ui.SkeletonLine
import com.effyshopping.mobile.kit.ui.SkeletonBlock
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import androidx.compose.ui.draw.clip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.rememberPhotoCapture
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason

/**
 * The same-day round (060 US1, design screen `delivery-run`).
 *
 * \u26a0 The design shows a delivery WINDOW per drop ("12:30\u20131:00"). Omitted throughout: 052 R4
 * established the platform's delivery promise is **date-granular** \u2014 there is no time window and
 * none can be derived. A driver reading one would repeat it to a customer as a commitment Effy has
 * not made.
 */
@Composable
fun DeliveryRunScreen(
    state: DeliveryUiState,
    onBack: () -> Unit,
    onOpenDrop: (String) -> Unit,
    onRefresh: () -> Unit = {},
) {
    val run = state.run
    val delivered = run?.drops?.count { it.status == DropStatus.DELIVERED } ?: 0
    val total = run?.drops?.size ?: 0

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        DeliveryHeader(
            title = "Same-day run",
            subtitle = if (run != null) {
                "$total drop${if (total == 1) "" else "s"} \u00b7 from the hub"
            } else {
                null
            },
            onBack = onBack,
        )

        when {
            state.isLoading && run == null -> Centered { CircularProgressIndicator() }
            run == null -> Centered { Text(state.message ?: "Couldn't load the run.") }
            run.drops.isEmpty() -> Centered { Text("No drops in this run.") }
            else -> {
                DeliveryProgressBar(if (total == 0) 0f else delivered.toFloat() / total)
                EffyPullToRefresh(onRefresh = { onRefresh() }, modifier = Modifier.weight(1f)) {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                            .padding(horizontal = 20.dp),
                    ) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "$delivered of $total delivered \u00b7 pull down to refresh",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(14.dp))

                        run.drops.forEach { drop ->
                            DropRow(drop = drop, onClick = { onOpenDrop(drop.dropId) })
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                        Spacer(Modifier.height(24.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun DropRow(drop: DropSummary, onClick: () -> Unit) {
    val done = drop.status == DropStatus.DELIVERED
    val failed = drop.status == DropStatus.FAILED
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 48.dp)
            .padding(vertical = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = when {
                done -> MaterialTheme.colorScheme.primary
                failed -> MaterialTheme.colorScheme.errorContainer
                else -> MaterialTheme.colorScheme.surfaceVariant
            },
            modifier = Modifier.size(34.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    when {
                        done -> "\u2713"
                        failed -> "\u2715"
                        else -> drop.sequence.toString()
                    },
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = when {
                        done -> MaterialTheme.colorScheme.onPrimary
                        failed -> MaterialTheme.colorScheme.onErrorContainer
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                drop.orderRef,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "${drop.customerSuburb} \u00b7 ${drop.packageCount} " +
                    "package${if (drop.packageCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * A drop, in whatever state it is in (060 US1, design screens `drop-detail`, `enroute`, `arrived`).
 *
 * \u26a0 **This dispatches on status; it is not one layout with a changing button.** Before 060
 * every state rendered the same body \u2014 the driver tapped, the status advanced, and nothing they
 * could see changed. `EN_ROUTE` and `ARRIVED` now have their own screens.
 *
 * \u26a0 **049's transition sequence is preserved exactly** (`STAGED \u2192 out_for_delivery \u2192 en_route
 * \u2192 arrived`). The design collapses the first two into a single "Start this drop", but the
 * platform distinguishes them and 060 changes no backend behaviour (FR-024) \u2014 so `STAGED` and
 * `OUT_FOR_DELIVERY` share the detail screen with a label that names the step they are on, and the
 * status chip says which.
 */
@Composable
fun DropDetailScreen(
    state: DeliveryUiState,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    onAdvance: (String) -> Unit,
    onDeliverContactless: (ByteArray, String?) -> Unit,
    onDeliverPhoto: (ByteArray, String?) -> Unit,
    onDeliverSignature: (ByteArray, String?) -> Unit,
    onFail: (FailureReason, String?) -> Unit,
    onNext: () -> Unit,
    reducedMotion: Boolean = false,
) {
    val drop = state.drop
    when {
        state.delivered -> {
            val d = state.drop
            ProofSuccessScreen(
                orderRef = d?.orderRef.orEmpty(),
                packageCount = d?.packages?.size ?: 0,
                address = d?.addressFull.orEmpty(),
                // \u26a0 The method is known; the design's "12:44 pm" is not \u2014 no clock dependency.
                methodLabel = null,
                dropsDone = state.run?.drops?.count { it.status == DropStatus.DELIVERED },
                dropsLeft = state.run?.drops?.count {
                    it.status != DropStatus.DELIVERED && it.status != DropStatus.FAILED
                },
                onNextDrop = onNext,
                onBackToRun = onNext,
            )
            return
        }
        state.failed -> { FailedState(onNext); return }
        state.isLoading && drop == null -> { DropSkeleton(reducedMotion); return }
        drop == null -> { Centered { Text(state.message ?: "Couldn't load the drop.") }; return }
    }
    drop!!

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        DeliveryHeader(title = drop.orderRef, subtitle = null, onBack = onBack)

        state.message?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
        }

        Box(Modifier.weight(1f)) {
            when (drop.status) {
                DropStatus.STAGED, DropStatus.OUT_FOR_DELIVERY -> DropDetailBody(
                    drop = drop,
                    working = state.isWorking,
                    onNavigate = onNavigate,
                    onStart = {
                        onAdvance(
                            if (drop.status == DropStatus.STAGED) "out_for_delivery" else "en_route",
                        )
                    },
                )

                DropStatus.EN_ROUTE -> EnRouteScreen(
                    drop = drop,
                    working = state.isWorking,
                    onNavigate = onNavigate,
                    onArrived = { onAdvance("arrived") },
                )

                DropStatus.ARRIVED -> ArrivedFlow(
                    drop = drop,
                    state = state,
                    reducedMotion = reducedMotion,
                    dropsDone = state.run?.drops?.count { it.status == DropStatus.DELIVERED },
                    dropsLeft = state.run?.drops?.count { it.status != DropStatus.DELIVERED && it.status != DropStatus.FAILED },
                    onDeliverContactless = onDeliverContactless,
                    onDeliverPhoto = onDeliverPhoto,
                    onDeliverSignature = onDeliverSignature,
                    onFail = onFail,
                )

                else -> Centered { Text("This drop is closed.") }
            }
        }
    }
}

/**
 * The drop before the driver sets off (design screen `drop-detail`).
 *
 * \u26a0 The packages are listed individually and the screen says plainly that they travel as one
 * drop. That is the hub-and-spoke model's least obvious consequence for a driver: two parcels from
 * two different shops are ONE customer's order, and leaving one in the van is a failed delivery
 * nobody notices until the customer calls.
 */
@Composable
private fun DropDetailBody(
    drop: Drop,
    working: Boolean,
    onNavigate: (String) -> Unit,
    onStart: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            StatusChip(
                when (drop.status) {
                    DropStatus.STAGED -> "Staged at hub"
                    else -> "Out for delivery"
                },
            )
            Spacer(Modifier.height(18.dp))

            SectionLabel("DELIVER TO")
            Spacer(Modifier.height(8.dp))
            Text(
                drop.customerName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                drop.addressFull,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            drop.instructions?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(18.dp))
                InstructionCallout(it)
            }

            Spacer(Modifier.height(24.dp))
            SectionLabel("PACKAGES FOR THIS DROP \u00b7 ${drop.packages.size}")
            Spacer(Modifier.height(8.dp))
            drop.packages.forEachIndexed { index, pkg ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.size(34.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                "${index + 1}",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Spacer(Modifier.width(14.dp))
                    Text(
                        pkg.ref,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }

            if (drop.packages.size > 1) {
                Spacer(Modifier.height(12.dp))
                Text(
                    "All ${drop.packages.size} packages were collected for this customer and " +
                        "travel as one drop.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(24.dp))
        }

        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            OutlinedButton(
                onClick = { onNavigate(drop.addressFull) },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) { Text("Navigate \u2197") }
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = onStart,
                enabled = !working,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text(
                    if (drop.status == DropStatus.STAGED) "Start this drop" else "On my way",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

/**
 * Arrived: the designed screen first, then proof capture (060 US1).
 *
 * \u26a0 One local mode variable rather than more routes. Proof is a modal step within a single
 * drop \u2014 backing out of it must land the driver at the door, not at the run \u2014 and a route per
 * proof method would put four entries in the back stack for one delivery.
 */
@Composable
private fun ArrivedFlow(
    drop: Drop,
    state: DeliveryUiState,
    reducedMotion: Boolean,
    dropsDone: Int?,
    dropsLeft: Int?,
    onDeliverContactless: (ByteArray, String?) -> Unit,
    onDeliverPhoto: (ByteArray, String?) -> Unit,
    onDeliverSignature: (ByteArray, String?) -> Unit,
    onFail: (FailureReason, String?) -> Unit,
) {
    var step by remember(drop.dropId) { mutableStateOf<ProofStep?>(null) }
    var failing by remember(drop.dropId) { mutableStateOf(false) }
    var note by remember(drop.dropId) { mutableStateOf("") }
    var failNote by remember(drop.dropId) { mutableStateOf("") }
    var reason by remember(drop.dropId) { mutableStateOf<FailureReason?>(null) }
    var spot by remember(drop.dropId) { mutableStateOf<DropSpot?>(null) }

    val photoCapture = rememberPhotoCapture { bytes -> onDeliverPhoto(bytes, note.ifBlank { null }) }

    when {
        failing -> ProofFailScreen(
            working = state.isWorking,
            reason = reason,
            note = failNote,
            onReasonChange = { reason = it },
            onNoteChange = { failNote = it },
            onBack = { failing = false },
            onConfirm = { reason?.let { onFail(it, failNote.ifBlank { null }) } },
        )

        step == ProofStep.PHOTO -> ProofPhotoScreen(
            drop = drop,
            working = state.isWorking,
            onBack = { step = null },
            onCaptured = { bytes -> onDeliverPhoto(bytes, note.ifBlank { null }) },
        )

        step == ProofStep.SIGNATURE -> Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        ) {
            Text(
                "Hand the phone to ${drop.customerName} to sign.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            SignaturePad(
                working = state.isWorking,
                onConfirm = { bytes -> onDeliverSignature(bytes, note.ifBlank { null }) },
                onBack = { step = null },
            )
        }

        step == ProofStep.CONTACTLESS -> ProofContactlessScreen(
            working = state.isWorking,
            spot = spot,
            note = note,
            onSpotChange = { spot = it },
            onNoteChange = { note = it },
            onBack = { step = null },
            onConfirm = {
                // \u26a0 064 — THE SPOT IS NOT THE PROOF. Choosing "front door" records what the driver
                // says; the photograph records what is true. An unattended drop is the case most
                // likely to be disputed (FR-002), so this step now leads to the camera rather than
                // completing the delivery.
                step = ProofStep.CONTACTLESS_PHOTO
            },
        )

        step == ProofStep.CONTACTLESS_PHOTO -> ProofPhotoScreen(
            drop = drop,
            working = state.isWorking,
            onBack = { step = ProofStep.CONTACTLESS },
            onCaptured = { bytes ->
                // \u26a0 The chosen spot is serialised into the note the repository already takes, so
                // no contract change (FR-023, carried over from 060).
                val composed = listOfNotNull(
                    spot?.let { "Left at: ${it.label}" },
                    note.takeIf { it.isNotBlank() },
                ).joinToString(" \u2014 ").ifBlank { null }
                onDeliverContactless(bytes, composed)
            },
        )

        step == ProofStep.PICK -> ProofPicker(
            packageCount = drop.packages.size,
            note = note,
            onNoteChange = { note = it },
            onPick = { step = it },
            photoAvailable = true,
        )

        else -> ArrivedScreen(
            drop = drop,
            working = state.isWorking,
            onComplete = { step = ProofStep.PICK },
            onCantDeliver = { failing = true },
        )
    }
}

// \u2500\u2500 Shared chrome \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

@Composable
private fun DeliveryHeader(title: String, subtitle: String?, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 18.dp, end = 20.dp, top = 4.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = RoundedCornerShape(11.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.size(48.dp).clickable(onClick = onBack),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("\u2190", style = MaterialTheme.typography.titleMedium)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            subtitle?.let {
                Spacer(Modifier.height(5.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DeliveryProgressBar(fraction: Float) {
    Box(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp).height(5.dp)
            .clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Box(
            Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight()
                .clip(CircleShape).background(MaterialTheme.colorScheme.primary),
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun FailedState(onNext: () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Marked undeliverable", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Text("Back-office will follow up.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onNext, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(0.7f).height(56.dp)) { Text("Next") }
    }
}


@Composable
private fun Header(title: String, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onBack) { Text("‹ Back") }
        Spacer(Modifier.width(4.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { content() }
}

/**
 * Design screen `detail-skeleton` (060 US6, T085).
 *
 * \u26a0 Built from the SAME primitives as `DropDetailBody` \u2014 a map band, a chip, a heading block,
 * then numbered package rows. 028 recorded why that matters: a skeleton assembled from different
 * containers than its content cannot line up with it, and the mismatch reads as a broken screen
 * rather than as loading.
 */
@Composable
private fun DropSkeleton(reducedMotion: Boolean) {
    Column(Modifier.fillMaxSize()) {
        SkeletonBlock(height = 220.dp, corner = 0.dp, reducedMotion = reducedMotion)
        Column(
            Modifier.padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SkeletonLine(widthFraction = 0.28f, height = 22.dp, reducedMotion = reducedMotion)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SkeletonLine(widthFraction = 0.55f, height = 20.dp, reducedMotion = reducedMotion)
                SkeletonLine(widthFraction = 0.82f, reducedMotion = reducedMotion)
                SkeletonLine(widthFraction = 0.40f, height = 11.dp, reducedMotion = reducedMotion)
            }
            SkeletonBlock(height = 64.dp, reducedMotion = reducedMotion)
            repeat(2) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SkeletonSquare(size = 34.dp, reducedMotion = reducedMotion)
                    Spacer(Modifier.width(14.dp))
                    SkeletonLine(widthFraction = 0.45f, reducedMotion = reducedMotion)
                }
            }
        }
    }
}
