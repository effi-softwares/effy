package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.CameraPreviewSurface
import com.effyshopping.driver.mobile.core.platform.rememberCameraCaptureController
import com.effyshopping.driver.mobile.core.platform.rememberPhotoCapture
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import com.effyshopping.mobile.kit.ui.ChoiceChips
import com.effyshopping.mobile.kit.ui.DigitBoxes
import com.effyshopping.mobile.kit.ui.NumericKeypad

/** Which proof step the driver is on. Local to a drop — see `ArrivedFlow`. */
/**
 * ⚠ `CODE` REMOVED AND `CONTACTLESS_PHOTO` ADDED BY 064.
 *
 * `CODE` is gone because no delivery code exists on the platform to check one against (FR-003) — the
 * backend refuses the method by name, so offering it would walk a driver to a doorstep and then fail.
 *
 * `CONTACTLESS_PHOTO` is the second half of an unattended drop: the driver says WHERE they left it,
 * then photographs it (FR-002). Two steps rather than one screen because the spot is chosen before
 * the camera opens, and a camera that opens before the driver has decided is a camera they dismiss.
 */
internal enum class ProofStep { PICK, PHOTO, SIGNATURE, CONTACTLESS, CONTACTLESS_PHOTO }

// ── Picker (design screen `proof-pick`) ─────────────────────────────────────────────────────────

/**
 * Choose how this drop is proven (060 US1, FR-022, design screen `proof-pick`).
 *
 * ⚠ **The note field is new and it is the point of this screen's rebuild.** Every proof path in the
 * app passed `null` for the note — while `completeWithCode`, `completeContactless` and
 * `completeWithMedia` have all accepted one since 049. A UI gap, not a contract gap: the driver had
 * no way to say "left with the neighbour at number 12" on a delivery that will later be disputed.
 */
@Composable
internal fun ProofPicker(
    packageCount: Int,
    note: String,
    onNoteChange: (String) -> Unit,
    onPick: (ProofStep) -> Unit,
    photoAvailable: Boolean,
) {
    Column(Modifier.fillMaxSize().imePadding()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            Text(
                "Proof of delivery",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Pick how you're proving this drop. One is enough, and it covers " +
                    if (packageCount == 1) "the package." else "all $packageCount packages.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(20.dp))

            if (photoAvailable) {
                ProofOption("Photo", "Snap the packages where you left them") { onPick(ProofStep.PHOTO) }
            }
            ProofOption("Signature", "Customer signs on your screen") { onPick(ProofStep.SIGNATURE) }
            if (photoAvailable) {
                // ⚠ Gated on the camera: an unattended drop MUST be photographed (FR-002), so
                // without capture there is no honest way to offer it.
                ProofOption("Leave at door", "Say where, then photograph it") { onPick(ProofStep.CONTACTLESS) }
            }

            Spacer(Modifier.height(22.dp))
            Text(
                "NOTE (OPTIONAL)",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = note,
                onValueChange = onNoteChange,
                placeholder = { Text("Left with resident at door…") },
                minLines = 2,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "The note travels with whichever proof you pick.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ProofOption(title: String, body: String, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text(
                    body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text("›", style = MaterialTheme.typography.titleLarge)
        }
    }
    Spacer(Modifier.height(10.dp))
}

// ── Photo (design screen `proof-photo`) ─────────────────────────────────────────────────────────

/**
 * In-app photo proof (060 US1, design screen `proof-photo`).
 *
 * ⚠ **The chrome is shared; only the viewfinder is per-platform** (research R8). Android renders a
 * live CameraX preview; iOS renders the stand-in below and the shutter hands off to the system
 * camera. The screen is the same on both.
 *
 * ⚠ **The caption bar carries the address but NOT a timestamp or a geotag.** The design shows
 * "27 Rathdowne St · 22 Aug 12:44 pm AEST". The address is real; the time needs a clock this app
 * has no dependency for, and the geotag needs location capture that is not wired. A wrong geotag on
 * a delivery record is evidence in a dispute, so it is omitted rather than invented (FR-015).
 */
@Composable
internal fun ProofPhotoScreen(
    drop: Drop,
    working: Boolean,
    onBack: () -> Unit,
    onCaptured: (ByteArray) -> Unit,
) {
    val controller = rememberCameraCaptureController()
    val systemCamera = rememberPhotoCapture(onCaptured)

    Column(Modifier.fillMaxSize()) {
        ProofHeader(
            title = "Photo proof",
            trailing = "${drop.packages.size} package${if (drop.packages.size == 1) "" else "s"}",
            onBack = onBack,
        )

        Box(Modifier.weight(1f).fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant)) {
            val live = CameraPreviewSurface(
                modifier = Modifier.fillMaxSize(),
                controller = controller,
                onCaptured = onCaptured,
            )
            if (!live) {
                Column(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        "Camera opens when you press the shutter",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Frame both the packages and where you left them.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }

        // Caption bar — only what the platform actually knows.
        Text(
            drop.addressFull,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
        )

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // ⚠ The design's flash and flip controls are NOT rendered. They would do nothing: the
            // live path does not expose torch or lens selection yet, and the system-camera path has
            // its own controls. A dead button is worse than an absent one (054's decorative tabs).
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(72.dp).clickable(enabled = !working) {
                    if (controller.isLive) controller.take() else systemCamera?.invoke()
                },
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        "●",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }
        }
    }
}

// ── Delivery code — REMOVED BY 064 ──────────────────────────────────────────────────────────────
//
// ⚠ `ProofCodeScreen` AND ITS STEP ARE GONE, NOT HIDDEN (FR-003, research R4). No delivery code
// exists anywhere on this platform — `delivery_code` appears in no service, migration, contract or
// app — so there has never been anything for a four-digit entry to be checked against. The backend
// refuses `method: "code"` by name and the database CHECK excludes the value.
//
// It is DELETED rather than left behind a flag because a screen nothing routes to is dead code that
// reads as a feature, and the next person to find it restores it by resemblance. When a code is
// actually issued, this screen comes back with the mechanism that makes it mean something — and
// `NumericKeypad`, which it was the motivating case for, is still here for that.

@Composable
internal fun ProofContactlessScreen(
    working: Boolean,
    spot: DropSpot?,
    note: String,
    onSpotChange: (DropSpot) -> Unit,
    onNoteChange: (String) -> Unit,
    onBack: () -> Unit,
    onConfirm: () -> Unit,
) {
    Column(Modifier.fillMaxSize().imePadding()) {
        ProofHeader(title = "Leave at door", trailing = null, onBack = onBack)

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            Text(
                "WHERE YOU LEFT IT",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            ChoiceChips(
                options = DropSpot.entries.toList(),
                selected = spot,
                onSelect = onSpotChange,
                label = { it.label },
            )

            Spacer(Modifier.height(24.dp))
            Text(
                "ANYTHING ELSE? (OPTIONAL)",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = note,
                onValueChange = onNoteChange,
                placeholder = { Text("Behind the planter, out of the rain…") },
                minLines = 2,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(24.dp))
        }

        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            Button(
                // ⚠ A spot is required. "Left at door" with no location is the report that helps
                // nobody when the customer says the parcel never arrived.
                onClick = onConfirm,
                enabled = spot != null && !working,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text(
                    "Mark delivered",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

// ── Success (design screen `success`) ───────────────────────────────────────────────────────────

/**
 * Drop complete (060 US1, design screen `success`).
 *
 * ⚠ The design's "12:44 pm · photo proof captured" keeps only its second half. The **method** is
 * known; the **time** needs a clock this app has no dependency for.
 *
 * ⚠ "Drops done / Drops left" are **real** — derived from the run the driver is on, not invented.
 */
@Composable
internal fun ProofSuccessScreen(
    orderRef: String,
    packageCount: Int,
    address: String,
    methodLabel: String?,
    dropsDone: Int?,
    dropsLeft: Int?,
    onNextDrop: () -> Unit,
    onBackToRun: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))

        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(84.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    "✓",
                    style = MaterialTheme.typography.displaySmall,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }
        Spacer(Modifier.height(22.dp))
        Text(
            "Drop complete",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            "$orderRef · $packageCount package${if (packageCount == 1) "" else "s"}\n$address",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        methodLabel?.let {
            Spacer(Modifier.height(6.dp))
            Text(
                "$it captured",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (dropsDone != null && dropsLeft != null) {
            Spacer(Modifier.height(28.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(40.dp)) {
                RunStat(dropsDone.toString(), "Drops done")
                RunStat(dropsLeft.toString(), "Drops left")
            }
        }

        Spacer(Modifier.weight(1f))

        Button(
            onClick = onNextDrop,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(56.dp),
        ) {
            Text(
                if ((dropsLeft ?: 0) > 0) "Next drop" else "Back to run",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onBackToRun, modifier = Modifier.fillMaxWidth().height(48.dp)) {
            Text("Back to run")
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun RunStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text(
            label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ── Undeliverable (design screen `failed`) ──────────────────────────────────────────────────────

/**
 * Mark a drop undeliverable (060 US1, FR-022, design screen `failed`).
 *
 * ⚠ **THE DESIGN'S COPY PROMISES SOMETHING THE PLATFORM DOES NOT DO.** It reads "Dispatch is
 * notified and both packages return to the hub at the end of your run." There is **no return-to-hub
 * process modelled** and **no re-attempt scheduling** — 056 built the back-office reader for
 * `delivery_failure` and recorded explicitly that this is "closed for Effy, NOT for the shopper".
 * Telling a driver the packages are handled would be a promise nobody keeps. The copy states only
 * what is true: the report reaches dispatch.
 *
 * ⚠ The note field is new (FR-022) — `fail` has always accepted one and every call site passed
 * `null`.
 */
@Composable
internal fun ProofFailScreen(
    working: Boolean,
    reason: FailureReason?,
    note: String,
    onReasonChange: (FailureReason) -> Unit,
    onNoteChange: (String) -> Unit,
    onBack: () -> Unit,
    onConfirm: () -> Unit,
) {
    Column(Modifier.fillMaxSize().imePadding()) {
        ProofHeader(title = "Can't deliver", trailing = null, onBack = onBack)

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            Text(
                "Pick a reason. Dispatch is notified.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(20.dp))

            FailureReason.entries.forEach { r ->
                ReasonRow(
                    label = r.label,
                    selected = reason == r,
                    enabled = !working,
                    onClick = { onReasonChange(r) },
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }

            Spacer(Modifier.height(20.dp))
            Text(
                "NOTE FOR DISPATCH (OPTIONAL)",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = note,
                onValueChange = onNoteChange,
                placeholder = { Text("What happened?") },
                minLines = 2,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(24.dp))
        }

        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            Button(
                onClick = onConfirm,
                enabled = reason != null && !working,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text(
                    "Mark undeliverable",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

private val FailureReason.label: String
    get() = when (this) {
        FailureReason.NOBODY_HOME -> "Nobody home"
        FailureReason.WRONG_ADDRESS -> "Wrong or incomplete address"
        FailureReason.CUSTOMER_REFUSED -> "Customer refused delivery"
        FailureReason.ACCESS_BLOCKED -> "Access blocked (gate, buzzer, lift)"
        FailureReason.OTHER -> "Other — add a note"
    }

@Composable
private fun ReasonRow(label: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = CircleShape,
            color = if (selected) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.surface,
            border = if (selected) null else BorderStroke(1.5.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.size(22.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                if (selected) {
                    Box(
                        Modifier.size(8.dp).clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onError),
                    )
                }
            }
        }
        Spacer(Modifier.width(14.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

// ── Shared ──────────────────────────────────────────────────────────────────────────────────────

@Composable
private fun ProofHeader(title: String, trailing: String?, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 18.dp, end = 20.dp, top = 4.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = RoundedCornerShape(11.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.size(48.dp).clickable(onClick = onBack),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("←", style = MaterialTheme.typography.titleMedium)
            }
        }
        Spacer(Modifier.width(12.dp))
        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )
        trailing?.let {
            Text(
                it,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
