package com.effyshopping.driver.mobile.core.scan

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverProgress
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.presentation.DriverTextField
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_camera
import com.effyshopping.driver.mobile.resources.lucide_check
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_flashlight
import com.effyshopping.driver.mobile.resources.lucide_flashlight_off
import com.effyshopping.driver.mobile.resources.lucide_keyboard
import com.effyshopping.driver.mobile.resources.lucide_package
import kotlinx.coroutines.delay

/** One package the step expects, as the list beneath the camera shows it. [hint] is the step's own word (the hub sort). */
data class ScanItem(val code: String, val title: String, val meta: String? = null, val hint: String? = null)

/** What the banner under the camera says about the last read. */
internal sealed interface ScanBanner {
    data class Counted(val item: ScanItem?, val code: String) : ScanBanner
    data class Already(val item: ScanItem?) : ScanBanner
    data class WrongPlace(val where: String) : ScanBanner
    data class NotYours(val code: String) : ScanBanner
    data object NotACode : ScanBanner
}

/**
 * 092 — the scanning screen every step shares (canvas `Scanner`, `ScanStates`, `TypeCode`): the camera
 * on top, the torch and "Type a code", a banner for the last read, a count, and the packages — each
 * tickable by hand. When every package is in, a bar counts three seconds with Undo, then completes.
 *
 * ⚠ ONE RULE: every read goes through [ScanSession] (090), offline. A package for another stop or drop is
 * a HARD STOP — a low tone, a long buzz, and it is not counted.
 */
@Composable
fun ScanPanel(
    title: String,
    backLabel: String,
    context: ScanContext,
    items: List<ScanItem>,
    completeLabel: String,
    working: Boolean,
    onBack: () -> Unit,
    onComplete: (List<HandedOver>) -> Unit,
    message: String? = null,
) {
    val session = remember(context) { ScanSession(context) }
    val methods = remember(context) { mutableStateMapOf<String, HandMethod>() }
    var version by remember { mutableIntStateOf(0) }
    var banner by remember { mutableStateOf<ScanBanner?>(null) }
    var torch by remember { mutableStateOf(false) }
    var typing by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<ScannerUnavailable?>(null) }
    var completed by remember { mutableStateOf(false) }
    val order = remember(context) { mutableListOf<String>() }
    val tone = rememberScanTone()
    val haptics = LocalHapticFeedback.current
    val byCode = remember(items) { items.associateBy { it.code } }

    fun read(raw: String, method: HandMethod) {
        when (val o = session.judge(raw)) {
            is ScanOutcome.Accepted -> {
                methods[o.code] = method
                order += o.code
                banner = ScanBanner.Counted(byCode[o.code], o.code)
                tone.accepted(); haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            }
            is ScanOutcome.AlreadyScanned -> banner = ScanBanner.Already(byCode[o.code])
            is ScanOutcome.BelongsElsewhere -> {
                banner = ScanBanner.WrongPlace(o.where)
                tone.hardStop(); haptics.performHapticFeedback(HapticFeedbackType.Reject)
            }
            is ScanOutcome.NotOnYourWork -> {
                banner = ScanBanner.NotYours(o.code)
                tone.hardStop(); haptics.performHapticFeedback(HapticFeedbackType.Reject)
            }
            ScanOutcome.NotALabel -> if (method == HandMethod.TYPED) banner = ScanBanner.NotACode
        }
        version++
    }

    // `version` makes the derived counts re-read the session after every change.
    val scanned = remember(version) { session.scanned.toSet() }
    val complete = remember(version) { session.isComplete }

    Column(Modifier.fillMaxSize()) {
        DriverInlineBar(title, backLabel = backLabel, onBack = onBack)
        Box(Modifier.fillMaxWidth().fillMaxHeight(0.36f).background(Color.Black)) {
            if (camera == null) {
                PackageScanner(Modifier.fillMaxSize(), torchOn = torch, onCode = { read(it, HandMethod.SCAN) }, onUnavailable = { camera = it })
                Box(Modifier.align(Alignment.Center).size(220.dp, 150.dp).border(3.dp, Color.White, EffyStorefrontShape.card))
            } else {
                Column(Modifier.align(Alignment.Center).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    DriverIcon(Res.drawable.lucide_camera, size = 28.dp, tint = Color.White)
                    Text(
                        if (camera == ScannerUnavailable.PERMISSION_REFUSED) "The camera is off for Effy Driver. Type the codes, or tick the packages below."
                        else "This phone has no camera to scan with. Type the codes, or tick the packages below.",
                        color = Color.White, style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            Row(Modifier.align(Alignment.BottomCenter).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (camera == null) {
                    OverlayButton(if (torch) "Torch off" else "Torch", if (torch) Res.drawable.lucide_flashlight_off else Res.drawable.lucide_flashlight) { torch = !torch }
                }
                OverlayButton("Type a code", Res.drawable.lucide_keyboard) { typing = true }
            }
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            banner?.let { Banner(it, scanned.size, session.expectedCount) }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("${scanned.size} of ${session.expectedCount} scanned", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                DriverProgress(if (session.expectedCount == 0) 0f else scanned.size.toFloat() / session.expectedCount, done = complete)
            }
            Column(Modifier.clip(EffyStorefrontShape.card).border(1.dp, MaterialTheme.colorScheme.outlineVariant, EffyStorefrontShape.card)) {
                items.forEachIndexed { i, item ->
                    ItemRow(
                        item,
                        done = item.code in scanned,
                        method = methods[item.code],
                        last = i == items.lastIndex,
                        onTick = {
                            if (item.code in scanned) {
                                session.forget(item.code); methods.remove(item.code); order.remove(item.code); completed = false; version++
                            } else read(item.code, HandMethod.MANUAL)
                        },
                    )
                }
            }
            Text("Tap a package to tick it by hand if its label won't scan.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (complete) {
            AutoCompleteBar(
                label = completeLabel,
                count = session.expectedCount,
                working = working || completed,
                onUndo = {
                    // Undo takes back the last one counted: the driver looks again.
                    order.removeLastOrNull()?.let { session.forget(it); methods.remove(it) }
                    completed = false
                    version++
                },
                onGo = {
                    if (!completed) {
                        completed = true
                        onComplete(session.scanned.map { HandedOver(it, methods[it] ?: HandMethod.MANUAL) })
                    }
                },
            )
        }
    }

    if (typing) {
        TypeCodeSheet(onDismiss = { typing = false }, onCheck = { code -> typing = false; read(code, HandMethod.TYPED) })
    }
}

@Composable
private fun OverlayButton(label: String, icon: org.jetbrains.compose.resources.DrawableResource, onClick: () -> Unit) {
    Row(
        Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).border(1.dp, Color.White.copy(alpha = 0.4f), CircleShape)
            .clickable(role = Role.Button, onClick = onClick).heightIn(min = DriverSize.target).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        DriverIcon(icon, size = 18.dp, tint = Color.White)
        Text(label, color = Color.White, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
    }
}

@Composable
private fun Banner(b: ScanBanner, scanned: Int, expected: Int) {
    val mod = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }
    when (b) {
        is ScanBanner.Counted -> Row(
            mod.fillMaxWidth().clip(EffyStorefrontShape.card).background(EffyRoles.brandMuted).padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically,
        ) {
            DriverIcon(Res.drawable.lucide_check, size = 22.dp, tint = EffyRoles.brand)
            Column(Modifier.weight(1f)) {
                Text(b.item?.hint ?: b.item?.title ?: b.code, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                Text(
                    listOfNotNull(b.item?.title?.takeIf { b.item.hint != null }, "$scanned of $expected").joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        is ScanBanner.Already -> DriverAlert(DriverAlertKind.Muted, Res.drawable.lucide_check, title = "Already scanned", description = b.item?.title, modifier = mod)
        is ScanBanner.WrongPlace -> DriverAlert(
            DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, modifier = mod,
            title = "Wrong package — not for here",
            description = "This belongs to ${b.where}. Put it back; it isn't counted.",
        )
        is ScanBanner.NotYours -> DriverAlert(
            DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, modifier = mod,
            title = "Not on your work",
            description = "Package ${b.code} isn't on any of your runs. Keep it aside and tell dispatch.",
        )
        ScanBanner.NotACode -> DriverAlert(DriverAlertKind.Muted, Res.drawable.lucide_package, title = "That isn't a package code", description = "The code is the six letters and numbers in large type on the label.", modifier = mod)
    }
}

@Composable
private fun ItemRow(item: ScanItem, done: Boolean, method: HandMethod?, last: Boolean, onTick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Column {
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Checkbox, onClick = onTick)
                .semantics { stateDescription = if (done) "Scanned" else "Not scanned" }
                .heightIn(min = DriverSize.row).padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(26.dp).clip(EffyStorefrontShape.small)
                    .background(if (done) EffyRoles.brand else scheme.background)
                    .border(2.dp, if (done) EffyRoles.brand else scheme.outline, EffyStorefrontShape.small),
                contentAlignment = Alignment.Center,
            ) { if (done) DriverIcon(Res.drawable.lucide_check, size = 16.dp, tint = EffyRoles.brandForeground) }
            Column(Modifier.weight(1f)) {
                Text(item.title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
                Text(
                    listOfNotNull(item.code, item.meta, item.hint, if (method == HandMethod.MANUAL) "ticked by hand" else if (method == HandMethod.TYPED) "typed" else null).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant,
                )
            }
        }
        if (!last) HorizontalDivider(color = scheme.outlineVariant)
    }
}

/** All in: three seconds to Undo, then the step completes by itself. */
@Composable
private fun AutoCompleteBar(label: String, count: Int, working: Boolean, onUndo: () -> Unit, onGo: () -> Unit) {
    var left by remember { mutableIntStateOf(3) }
    LaunchedEffect(Unit) {
        while (left > 0) { delay(1_000); left-- }
        onGo()
    }
    Row(
        Modifier.fillMaxWidth().background(EffyRoles.brand).padding(horizontal = 16.dp, vertical = 14.dp)
            .semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "All $count scanned. $label." },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("All $count scanned", color = EffyRoles.brandForeground, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
            Text(if (working || left == 0) "$label…" else "$label in ${left}s", color = EffyRoles.brandForeground, style = MaterialTheme.typography.bodySmall)
        }
        if (!working && left > 0) {
            Text(
                "Undo",
                color = EffyRoles.brandForeground,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.clickable(role = Role.Button, onClick = onUndo).padding(horizontal = 12.dp, vertical = 12.dp),
            )
        }
    }
}

/** Type the code from a torn or unreadable label (canvas `TypeCode`). The same rule judges it. */
@Composable
private fun TypeCodeSheet(onDismiss: () -> Unit, onCheck: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    DriverSheet(title = "Type a code", description = "The six letters and numbers in large type on the label.", onDismiss = onDismiss) {
        DriverTextField(
            code, { code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(6) },
            label = "Package code",
            placeholder = "e.g. K7M3QX",
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Done),
        )
        DriverButton("Check this code", onClick = { onCheck(code) }, enabled = code.length == 6, modifier = Modifier.fillMaxWidth())
        DriverButton("Cancel", onClick = onDismiss, style = DriverButtonStyle.Ghost, tall = false, modifier = Modifier.fillMaxWidth())
    }
}
