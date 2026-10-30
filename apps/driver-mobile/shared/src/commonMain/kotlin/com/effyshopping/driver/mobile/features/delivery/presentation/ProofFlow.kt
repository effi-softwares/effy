package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.material3.HorizontalDivider
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_arrow_right
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.platform.CameraPreviewSurface
import com.effyshopping.driver.mobile.core.platform.localTimeText
import com.effyshopping.driver.mobile.core.platform.rememberCameraCaptureController
import com.effyshopping.driver.mobile.core.platform.rememberPhotoCapture
import com.effyshopping.driver.mobile.core.presentation.DriverActionBar
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverChoice
import com.effyshopping.driver.mobile.core.presentation.DriverDetailRow
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverProgress
import com.effyshopping.driver.mobile.core.presentation.DriverRow
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.presentation.DriverTextField
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import com.effyshopping.driver.mobile.features.delivery.domain.Handover
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_camera
import com.effyshopping.driver.mobile.resources.lucide_check
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_circle_x
import com.effyshopping.driver.mobile.resources.lucide_house
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_pen_line
import com.effyshopping.driver.mobile.resources.lucide_phone
import com.effyshopping.driver.mobile.resources.lucide_refresh_ccw
import com.effyshopping.driver.mobile.resources.lucide_rotate_ccw
import com.effyshopping.driver.mobile.resources.lucide_user_round
import com.effyshopping.driver.mobile.resources.lucide_x
import org.jetbrains.compose.resources.ExperimentalResourceApi
import org.jetbrains.compose.resources.decodeToImageBitmap

private fun ProofMethod.title(): String = when (this) {
    ProofMethod.CONTACTLESS -> "Left safely"
    ProofMethod.PHOTO -> "Handed over - photo"
    ProofMethod.SIGNATURE -> "Handed over - signature"
}

/** "How did you hand it over?" - the first of the two taps (canvas `ProofChoose`). */
@Composable
internal fun ProofChooser(drop: Drop, selected: ProofMethod, onSelect: (ProofMethod) -> Unit, onContinue: () -> Unit, onDismiss: () -> Unit) {
    DriverSheet(
        title = "How did you hand it over?",
        description = "${splitAddress(drop.addressFull).first} · ${packages(drop.packages.size)}",
        onDismiss = onDismiss,
    ) {
        DriverChoice(
            ProofMethod.CONTACTLESS.title(), selected == ProofMethod.CONTACTLESS, { onSelect(ProofMethod.CONTACTLESS) },
            body = "Nobody took it. Photograph where you left it.", icon = Res.drawable.lucide_house,
            tag = if (drop.handover == Handover.LeaveAtDoor) "Customer asked" else null,
        )
        DriverChoice(
            ProofMethod.PHOTO.title(), selected == ProofMethod.PHOTO, { onSelect(ProofMethod.PHOTO) },
            body = "Given to someone at the address.", icon = Res.drawable.lucide_user_round,
            tag = if (drop.handover == Handover.MeetAtDoor) "Customer asked" else null,
        )
        DriverChoice(
            ProofMethod.SIGNATURE.title(), selected == ProofMethod.SIGNATURE, { onSelect(ProofMethod.SIGNATURE) },
            body = "The customer signs on your screen.", icon = Res.drawable.lucide_pen_line,
        )
        DriverButton(
            if (selected == ProofMethod.SIGNATURE) "Get a signature" else "Take the photo",
            onClick = onContinue,
            icon = if (selected == ProofMethod.SIGNATURE) Res.drawable.lucide_pen_line else Res.drawable.lucide_camera,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        )
    }
}

/**
 * The camera for photo proof (canvas `ProofPhoto`). Always dark, whatever the appearance: it frames
 * a live picture, and a light frame around a viewfinder is glare at a doorstep at night. A live preview
 * where the platform has one; otherwise the shutter opens the system camera.
 */
@Composable
internal fun ProofCamera(method: ProofMethod, onClose: () -> Unit, onCaptured: (ByteArray) -> Unit, onDenied: () -> Unit) {
    val controller = rememberCameraCaptureController()
    val system = rememberPhotoCapture(onCaptured, onDenied)
    Column(Modifier.fillMaxSize().background(Color.Black).statusBarsPadding().navigationBarsPadding()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(DriverSize.target).clip(CircleShape).clickable(role = Role.Button, onClick = onClose).semantics { contentDescription = "Close camera" },
                contentAlignment = Alignment.Center,
            ) { DriverIcon(Res.drawable.lucide_x, size = 24.dp, tint = Color.White) }
            Text(
                "${if (method == ProofMethod.CONTACTLESS) "Left safely" else "Handed over"} · photo",
                color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center, modifier = Modifier.weight(1f).padding(end = DriverSize.target),
            )
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val live = CameraPreviewSurface(Modifier.fillMaxSize(), controller, onCaptured)
            if (!live) {
                Text(
                    "The camera opens when you press the shutter.",
                    color = Color.White, textAlign = TextAlign.Center,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
            }
        }
        Text(
            if (method == ProofMethod.CONTACTLESS) "Get the parcels and the door in one shot, so the customer can see where they are."
            else "Get the parcels in the shot as you hand them over.",
            color = Color.White, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp),
        )
        Box(Modifier.fillMaxWidth().padding(bottom = 16.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .size(76.dp)
                    .clip(CircleShape)
                    .border(4.dp, Color.White, CircleShape)
                    .padding(8.dp)
                    .clip(CircleShape)
                    .background(Color.White)
                    .clickable(role = Role.Button) { if (controller.isLive) controller.take() else system?.invoke() }
                    .semantics { contentDescription = "Take photo" },
            )
        }
    }
}

/** The photo just taken: where it was left (contactless) and an optional note (canvas `ProofContactless`). */
@OptIn(ExperimentalResourceApi::class, ExperimentalLayoutApi::class)
@Composable
internal fun ProofReview(
    drop: Drop,
    method: ProofMethod,
    photo: ByteArray,
    working: Boolean,
    message: String?,
    onRetake: () -> Unit,
    onComplete: (note: String?) -> Unit,
) {
    var spot by rememberSaveable(drop.dropId) { mutableStateOf<DropSpot?>(null) }
    var note by rememberSaveable(drop.dropId) { mutableStateOf("") }
    val takenAt = remember(photo) { localTimeText(nowEpochMillis(), withDay = false) }
    val bitmap = remember(photo) { runCatching { photo.decodeToImageBitmap() }.getOrNull() }
    val contactless = method == ProofMethod.CONTACTLESS
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar(if (contactless) "Left safely" else "Handed over", backLabel = "Camera", onBack = onRetake)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            Box(Modifier.fillMaxWidth().aspectRatio(3f / 2f).clip(EffyStorefrontShape.banner).background(MaterialTheme.colorScheme.surfaceVariant)) {
                if (bitmap != null) {
                    Image(bitmap, contentDescription = "The proof photo", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                }
                Row(
                    Modifier.align(Alignment.BottomStart).padding(12.dp).clip(EffyStorefrontShape.control).background(EffyRoles.brandMuted).padding(horizontal = 8.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically,
                ) {
                    DriverIcon(Res.drawable.lucide_check, size = 13.dp, tint = EffyRoles.brand)
                    Text("Photo taken $takenAt", fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold, color = EffyRoles.brand)
                }
            }
            Row(
                Modifier.clickable(role = Role.Button, onClick = onRetake).padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
            ) {
                DriverIcon(Res.drawable.lucide_rotate_ccw, size = 18.dp, tint = MaterialTheme.colorScheme.primary)
                Text("Retake", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = MaterialTheme.colorScheme.primary, textDecoration = TextDecoration.Underline)
            }
            if (contactless) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Where did you leave it?", fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold)
                    DropSpot.entries.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            pair.forEach { s -> SpotChip(s.label, selected = spot == s, onClick = { spot = s }, modifier = Modifier.weight(1f)) }
                        }
                    }
                }
            }
            DriverTextField(note, { note = it }, label = "Note (optional)", placeholder = "Anything the customer should know", lines = 2)
        }
        DriverActionBar {
            DriverButton(
                "Complete delivery",
                onClick = {
                    onComplete(
                        listOfNotNull(spot?.let { "Left at: ${it.label}" }, note.trim().takeIf { it.isNotEmpty() })
                            .joinToString(" - ").ifBlank { null },
                    )
                },
                // A spot is required when nobody took it: "left at the door" with no place is the report
                // that helps no one in a dispute.
                enabled = !contactless || spot != null,
                loading = working,
                icon = Res.drawable.lucide_check,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun SpotChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val shape = EffyStorefrontShape.card
    Text(
        label,
        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
        color = scheme.onSurface,
        maxLines = 1,
        modifier = modifier
            .clip(shape)
            .background(if (selected) EffyRoles.primaryMuted else scheme.background)
            .border(if (selected) 2.dp else 1.dp, if (selected) scheme.primary else scheme.outlineVariant, shape)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .heightIn(min = 56.dp)
            .padding(horizontal = 14.dp, vertical = 16.dp),
    )
}

/** The customer signs on the driver's screen (canvas `ProofSignature`). */
@Composable
internal fun ProofSignatureScreen(drop: Drop, working: Boolean, message: String?, onBack: () -> Unit, onComplete: (ByteArray, String?) -> Unit) {
    val pad = rememberSignatureState()
    val name = drop.customerName.trim()
    var signedBy by rememberSaveable(drop.dropId) { mutableStateOf(name) }
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Signature", backLabel = "Drop", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            Text(
                name.substringBefore(' ').ifBlank { null }?.let { "Ask $it to sign" } ?: "Ask the customer to sign",
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
            )
            Text("Turn the phone round. They sign with a finger in the box.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SignaturePad(pad)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Sign above the line", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                DriverButton("Clear and sign again", onClick = pad::clear, style = DriverButtonStyle.Ghost, icon = Res.drawable.lucide_rotate_ccw, tall = false)
            }
            DriverTextField(signedBy, { signedBy = it }, label = "Signed by", hint = "If someone else signs, put their name.")
        }
        DriverActionBar {
            DriverButton(
                "Complete delivery",
                onClick = {
                    val png = pad.render()
                    if (png.isNotEmpty()) onComplete(png, signedBy.trim().takeIf { it.isNotEmpty() }?.let { "Signed by: $it" })
                },
                enabled = !pad.isEmpty,
                loading = working,
                icon = Res.drawable.lucide_check,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun FailureReason.words(): String = when (this) {
    FailureReason.NOBODY_HOME -> "Nobody home"
    FailureReason.WRONG_ADDRESS -> "Wrong or incomplete address"
    FailureReason.CUSTOMER_REFUSED -> "Customer refused it"
    FailureReason.ACCESS_BLOCKED -> "Couldn't get in - gate, lift, building"
    FailureReason.OTHER -> "Something else"
}

/** Can't deliver (canvas `CantDeliver`): a reason, and what happened in words when it's "something else". */
@Composable
internal fun CantDeliverScreen(
    drop: Drop,
    working: Boolean,
    message: String?,
    onBack: () -> Unit,
    onCall: (() -> Unit)?,
    onRecord: (FailureReason, String?) -> Unit,
) {
    var reason by rememberSaveable(drop.dropId) { mutableStateOf<FailureReason?>(null) }
    var note by rememberSaveable(drop.dropId) { mutableStateOf("") }
    var tried by remember { mutableStateOf(false) }
    val needsNote = reason == FailureReason.OTHER && note.isBlank()
    val firstName = drop.customerName.trim().substringBefore(' ').ifBlank { null }
    Column(Modifier.fillMaxSize()) {
        DriverInlineBar("Can't deliver", backLabel = "Drop", onBack = onBack)
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            Column {
                Text("What happened?", fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "${drop.addressFull.split(", ").take(2).joinToString(", ")} · ${packages(drop.packages.size)}",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (onCall != null) {
                DriverAlert(
                    DriverAlertKind.Muted, Res.drawable.lucide_phone,
                    title = "Tried calling ${firstName ?: "the customer"}?",
                    description = "A quick call often sorts it out.",
                    actions = { DriverButton(firstName?.let { "Call $it" } ?: "Call", onClick = onCall, style = DriverButtonStyle.Outline, tall = false) },
                )
            }
            FailureReason.entries.forEach { r -> DriverChoice(r.words(), reason == r, { reason = r }) }
            DriverTextField(
                note, { note = it },
                label = if (reason == FailureReason.OTHER) "Tell us what happened" else "Anything to add (optional)",
                placeholder = "So someone can follow it up",
                lines = 3,
                problem = if (tried && needsNote) "Tell us what happened, so someone can follow it up." else null,
            )
        }
        DriverActionBar {
            DriverButton(
                "Record as not delivered",
                onClick = {
                    tried = true
                    val r = reason
                    if (r != null && !needsNote) onRecord(r, note.trim().ifBlank { null })
                },
                style = DriverButtonStyle.Problem,
                enabled = reason != null,
                loading = working,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** Delivered (canvas `Delivered`, `Delivered-Offline`). Green means done; offline is blue - saved, sending. */
@Composable
internal fun DeliveredView(
    drop: Drop,
    state: DeliveryUiState,
    nextName: String?,
    runDone: Int,
    runTotal: Int,
    onNext: () -> Unit,
    onBackToRun: () -> Unit,
) {
    val offline = state.proofSending
    val how = when (state.deliveredWith) {
        ProofMethod.CONTACTLESS -> "Photo · left safely"
        ProofMethod.PHOTO -> "Photo · handed over"
        ProofMethod.SIGNATURE -> "Signature"
        null -> "Recorded"
    }
    val leftAt = splitLeftAt(state.deliveredNote)
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Box(
                Modifier.size(64.dp).clip(CircleShape).background(if (offline) EffyRoles.primaryMuted else EffyRoles.brandMuted),
                contentAlignment = Alignment.Center,
            ) {
                DriverIcon(if (offline) Res.drawable.lucide_refresh_ccw else Res.drawable.lucide_check, size = 30.dp, tint = if (offline) MaterialTheme.colorScheme.primary else EffyRoles.brand)
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (offline) "Saved - sending when you're back online" else "Proof recorded · customer told",
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    color = if (offline) MaterialTheme.colorScheme.primary else EffyRoles.brand,
                )
                Text("Delivered", fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold)
                Text(
                    listOfNotNull(
                        drop.addressFull.split(", ").take(2).joinToString(", "),
                        packages(drop.packages.size),
                        leftAt?.let { "left at the ${it.lowercase()}" },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (offline) {
                DriverAlert(
                    DriverAlertKind.Info, Res.drawable.lucide_refresh_ccw,
                    title = "Proof saved on this phone",
                    description = "You're offline. It sends as soon as there's signal - carry on to the next drop. Don't sign out until it has.",
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                DriverGroup {
                    DriverDetailRow("Proof", how, last = state.deliveredAtEpochMillis == null && runTotal == 0)
                    state.deliveredAtEpochMillis?.let { at ->
                        val inWindow = drop.window?.let { at in it.startEpochMillis..it.endEpochMillis } == true
                        DriverDetailRow("Time", localTimeText(at, withDay = false) + if (inWindow) " · in the window" else "", last = runTotal == 0)
                    }
                    if (runTotal > 0) DriverDetailRow("This run", "$runDone of $runTotal done", last = true)
                }
                if (runTotal > 0) DriverProgress(runDone.toFloat() / runTotal, done = true)
            }
        }
        DriverActionBar {
            if (nextName != null) DriverButton("Next drop · $nextName", onClick = onNext, trailingIcon = Res.drawable.lucide_arrow_right, modifier = Modifier.fillMaxWidth())
            DriverButton("Back to the run", onClick = onBackToRun, style = if (nextName != null) DriverButtonStyle.Ghost else DriverButtonStyle.Primary, tall = nextName == null, modifier = Modifier.fillMaxWidth())
        }
    }
}

/** "Front door" from the proof note the app wrote ("Left at: Front door - …"); null when there is none. */
private fun splitLeftAt(note: String?): String? =
    note?.trim()?.takeIf { it.startsWith("Left at: ") }?.removePrefix("Left at: ")?.substringBefore(" - ")?.ifBlank { null }

/** Not delivered (canvas `CantDeliver-Done`): keep the parcels in the van for the hub. */
@Composable
internal fun NotDeliveredView(
    drop: Drop,
    state: DeliveryUiState,
    hubName: String?,
    nextName: String?,
    onNext: () -> Unit,
    onBackToRun: () -> Unit,
    onCallDispatch: (() -> Unit)?,
) {
    val n = drop.packages.size
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Box(Modifier.size(64.dp).clip(CircleShape).background(scheme.surfaceVariant), contentAlignment = Alignment.Center) {
                DriverIcon(Res.drawable.lucide_package, size = 28.dp)
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    listOfNotNull("Recorded", state.deliveredAtEpochMillis?.let { localTimeText(it, withDay = false) }, "dispatch told").joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium), color = scheme.onSurfaceVariant,
                )
                Text("Not delivered", fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold)
                val why = state.failedReason?.let { r ->
                    val words = r.words().lowercase()
                    state.failedNote?.takeIf { it.isNotBlank() }?.let { "$words: \"$it\"" } ?: words
                }
                Text(
                    listOfNotNull(drop.addressFull.split(", ").take(2).joinToString(", "), why).joinToString(" · "),
                    style = MaterialTheme.typography.bodyLarge, color = scheme.onSurfaceVariant,
                )
            }
            val shape = EffyStorefrontShape.card
            Column(Modifier.fillMaxWidth().clip(shape).border(1.dp, scheme.outlineVariant, shape).padding(16.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    DriverIcon(Res.drawable.lucide_truck, size = 20.dp, modifier = Modifier.padding(top = 2.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            "Keep ${if (n == 1) "this package" else "these $n packages"} in the van",
                            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                        )
                        Text(
                            "Return ${if (n == 1) "it" else "them"} to ${hubName?.takeIf { it.isNotBlank() } ?: "the hub"} after your last drop. Today will remind you.",
                            style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant,
                        )
                    }
                }
                if (n > 0) {
                    HorizontalDivider(color = scheme.outlineVariant, modifier = Modifier.padding(vertical = 14.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        drop.packages.forEachIndexed { i, p ->
                            Row {
                                Text("Package ${i + 1} of $n" + if (p.summary.hasCold) " · cold" else "", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                                val items = p.summary.total.takeIf { it > 0 } ?: p.items.sumOf { it.qty }
                                Text(if (items == 1) "1 item" else "$items items", style = MaterialTheme.typography.bodyLarge, color = scheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
        DriverActionBar {
            if (nextName != null) DriverButton("Next drop · $nextName", onClick = onNext, trailingIcon = Res.drawable.lucide_arrow_right, modifier = Modifier.fillMaxWidth())
            else DriverButton("Back to the run", onClick = onBackToRun, modifier = Modifier.fillMaxWidth())
            if (onCallDispatch != null) DriverButton("Call dispatch", onClick = onCallDispatch, style = DriverButtonStyle.Ghost, tall = false, modifier = Modifier.fillMaxWidth())
        }
    }
}
