package com.effyshopping.driver.mobile.core.scan

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.navigationBarsPadding
import com.effyshopping.driver.mobile.design.EffyColor
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.presentation.DriverActionBar
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverNumberCircle
import com.effyshopping.driver.mobile.core.presentation.DriverProgress
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.design.effyMonoFontFamily
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_check
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_circle_check
import com.effyshopping.driver.mobile.resources.lucide_circle_x
import com.effyshopping.driver.mobile.resources.lucide_flashlight
import com.effyshopping.driver.mobile.resources.lucide_flashlight_off
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_rotate_ccw
import com.effyshopping.driver.mobile.resources.lucide_search
import com.effyshopping.driver.mobile.resources.lucide_truck
import kotlinx.coroutines.delay

/** Who takes a package from the hub — the coloured line under a row (Effy green, Courier blue). */
enum class RouteTone { Effy, Courier, None }

/** How a hub sort is drawn: load now (blue), shelve (dark), courier bay (outline). */
enum class ScanSwatch { Blue, Dark, Outline }

/** A group of packages counted together — a hub sort or a drop being loaded. */
data class ScanGroup(
    val key: String,
    val title: String,
    val sub: String?,
    /** Hub sorts carry a swatch; loading drops carry their number. */
    val swatch: ScanSwatch? = null,
    val number: Int? = null,
)

/** The hub's big instruction after a scan (redesign S2): "PUT IT IN — LOAD NOW". */
data class ScanSort(val word: String, val sub: String, val swatch: ScanSwatch)

/** One package the step expects. */
data class ScanItem(
    val code: String,
    /** The row's title ("EF-20481-2" in mono, or "Package 1 of 3"). */
    val title: String,
    val mono: Boolean = false,
    /** The line under it ("Effy · Today, 4 – 6 pm" / "Courier" / "2 items · cold"). */
    val meta: String? = null,
    val tone: RouteTone = RouteTone.None,
    /** What the green banner says when it is scanned. */
    val bannerTitle: String = title,
    val bannerSub: String? = meta,
    val group: ScanGroup? = null,
    val sort: ScanSort? = null,
)

/** What the banner over the camera says about the last read. */
internal sealed interface ScanBanner {
    data class Counted(val item: ScanItem?, val code: String) : ScanBanner
    data class Already(val item: ScanItem?) : ScanBanner
    data class WrongPlace(val where: String, val code: String) : ScanBanner
    data class NotYours(val code: String) : ScanBanner
    data object NotACode : ScanBanner
}

/**
 * 092 — the scanning screen every step shares (redesign `04 Scanning`): a camera box with corner
 * brackets, the count and the torch; a banner for the last read; the hub's instruction; the packages
 * (or their groups) with Type a code; the fallback at the bottom; and, once every package is in, a green
 * bar that counts three seconds with Undo, then completes.
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
    /** The section title above the list, given scanned and total: "Packages · 2 of 4 scanned". */
    listTitle: (scanned: Int, total: Int) -> String,
    /** The idle banner's second line ("Brunswick store · 4 packages"). */
    idleSub: String?,
    /** The auto-complete bar's words: "collecting" → "All 4 scanned — collecting…". */
    completeVerb: String,
    working: Boolean,
    onBack: () -> Unit,
    onComplete: (List<HandedOver>) -> Unit,
    fallbackLabel: String,
    onFallback: () -> Unit,
    modifier: Modifier = Modifier,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
    /** Shown under the list ("The last scan checks everything in…"). */
    listNote: String? = null,
    /** A line under the list's title ("8 of 12 packages loaded · 7 drops. Load the last drops first…"). */
    listSub: ((scanned: Int, total: Int) -> String)? = null,
    /** Group rows instead of package rows (hub sorts, drops being loaded). */
    grouped: Boolean = false,
    message: String? = null,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val session = remember(context) { ScanSession(context) }
    val methods = remember(context) { mutableStateMapOf<String, HandMethod>() }
    val order = remember(context) { mutableListOf<String>() }
    var version by remember { mutableIntStateOf(0) }
    var banner by remember { mutableStateOf<ScanBanner?>(null) }
    var flash by remember { mutableIntStateOf(0) }
    var torch by remember { mutableStateOf(false) }
    var typing by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<ScannerUnavailable?>(null) }
    var completed by remember { mutableStateOf(false) }
    var stopped by remember { mutableStateOf<ScanBanner.WrongPlace?>(null) }
    val tone = rememberScanTone()
    val haptics = LocalHapticFeedback.current
    val byCode = remember(items) { items.associateBy { it.code } }

    fun read(raw: String, method: HandMethod) {
        when (val o = session.judge(raw)) {
            is ScanOutcome.Accepted -> {
                methods[o.code] = method
                order += o.code
                banner = ScanBanner.Counted(byCode[o.code], o.code)
                flash++
                tone.accepted(); haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            }
            is ScanOutcome.AlreadyScanned -> banner = ScanBanner.Already(byCode[o.code])
            is ScanOutcome.BelongsElsewhere -> {
                banner = ScanBanner.WrongPlace(o.where, o.code)
                stopped = ScanBanner.WrongPlace(o.where, o.code)
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

    val scanned = remember(version) { session.scanned.toSet() }
    val complete = remember(version) { session.isComplete }
    val total = session.expectedCount
    val lastSort = (banner as? ScanBanner.Counted)?.item?.sort

    Column(modifier.fillMaxSize()) {
        DriverInlineBar(title, backLabel = backLabel, onBack = onBack)
        CameraBox(
            scanned = scanned.size,
            total = total,
            banner = banner,
            flash = flash,
            idleSub = idleSub,
            torch = torch,
            camera = camera,
            onTorch = { torch = !torch },
            onCode = { read(it, HandMethod.SCAN) },
            onUnavailable = { camera = it },
        )
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            message?.let { DriverAlert(DriverAlertKind.Problem, Res.drawable.lucide_circle_alert, title = it) }
            lastSort?.let { SortCard(it) }
            stopped?.let { s ->
                DriverAlert(
                    DriverAlertKind.Problem, Res.drawable.lucide_circle_alert,
                    title = "Don't hand this one over",
                    description = "${s.code} belongs to ${s.where}. Put it back in the van.",
                    actions = { DriverButton("OK, put it back", onClick = { stopped = null }, style = DriverButtonStyle.Outline, tall = false) },
                )
            }
            Row(verticalAlignment = Alignment.Top) {
                Text(listTitle(scanned.size, total), fontSize = 26.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(
                    "Type a code",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier.padding(start = 12.dp, top = 4.dp).clickable(role = Role.Button) { typing = true },
                )
            }
            listSub?.let { Text(it(scanned.size, total), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            val shape = EffyStorefrontShape.banner
            Column(Modifier.fillMaxWidth().clip(shape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)) {
                if (grouped) {
                    val groups = items.mapNotNull { it.group }.distinctBy { it.key }
                    groups.forEachIndexed { i, g ->
                        val inGroup = items.filter { it.group?.key == g.key }
                        GroupRow(g, inGroup.count { it.code in scanned }, inGroup.size, last = i == groups.lastIndex)
                    }
                } else {
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
            }
            listNote?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            footer?.invoke(this)
        }
        if (complete) {
            AutoCompleteBar(
                count = total,
                verb = completeVerb,
                working = working || completed,
                onUndo = {
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
        } else {
            DriverActionBar {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    DriverButton(fallbackLabel, onClick = onFallback, style = DriverButtonStyle.Outline, tall = false, modifier = Modifier.weight(1f))
                    if (secondaryLabel != null && onSecondary != null) {
                        DriverButton(secondaryLabel, onClick = onSecondary, style = DriverButtonStyle.Ghost, tall = false)
                    }
                }
            }
        }
    }

    if (typing) {
        TypeCodeSheet(
            preview = { code ->
                val o = ScanRule.judge(code, session.context, session.scanned)
                when (o) {
                    is ScanOutcome.Accepted -> "Matches ${byCode[o.code]?.bannerTitle ?: o.code} · this stop"
                    is ScanOutcome.AlreadyScanned -> "Already scanned"
                    is ScanOutcome.BelongsElsewhere -> "For ${o.where} — not here"
                    is ScanOutcome.NotOnYourWork -> "Not on any of your runs"
                    ScanOutcome.NotALabel -> null
                } to (o is ScanOutcome.Accepted)
            },
            onDismiss = { typing = false },
            onAdd = { code -> typing = false; read(code, HandMethod.TYPED) },
        )
    }
}

// ── the camera box ─────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ Always dark, whatever the appearance: it frames a live picture (as the photo camera). So its chrome
 * reads the DARK palette directly, and its result banners the LIGHT one — fixed, but still tokens.
 */
private val CameraGround = EffyColor.Dark.muted
private val CameraChip = EffyColor.Dark.background
private val Bracket = EffyColor.Dark.foreground
private val BracketOk = EffyColor.Dark.brand
private val PaperBanner = EffyColor.Light.background
private val GreyBanner = EffyColor.Light.border
private val BannerInk = EffyColor.Light.foreground
@Composable
private fun CameraBox(
    scanned: Int,
    total: Int,
    banner: ScanBanner?,
    flash: Int,
    idleSub: String?,
    torch: Boolean,
    camera: ScannerUnavailable?,
    onTorch: () -> Unit,
    onCode: (String) -> Unit,
    onUnavailable: (ScannerUnavailable) -> Unit,
) {
    // The green tick and green brackets show for a moment after a package counts.
    var showOk by remember { mutableStateOf(false) }
    LaunchedEffect(flash) {
        if (flash == 0) return@LaunchedEffect
        showOk = true
        delay(1200)
        showOk = false
    }
    val ok = showOk && banner is ScanBanner.Counted
    Box(Modifier.fillMaxWidth().height(300.dp).background(CameraGround)) {
        if (camera == null) {
            PackageScanner(Modifier.fillMaxSize(), torchOn = torch, onCode = onCode, onUnavailable = onUnavailable)
        }
        // Corner brackets and, when idle, the aiming line.
        BoxWithConstraints(Modifier.align(Alignment.TopCenter).padding(top = 34.dp).size(width = 200.dp, height = 200.dp)) {
            val colour = if (ok) BracketOk else Bracket
            Canvas(Modifier.fillMaxSize()) {
                val w = size.width; val h = size.height
                val l = 36.dp.toPx(); val r = 10.dp.toPx(); val sw = 4.dp.toPx()
                val st = Stroke(sw, cap = StrokeCap.Butt)
                fun corner(x: Float, y: Float, dx: Float, dy: Float) {
                    val p = androidx.compose.ui.graphics.Path().apply {
                        moveTo(x + dx * l, y)
                        lineTo(x + dx * r, y)
                        quadraticTo(x, y, x, y + dy * r)
                        lineTo(x, y + dy * l)
                    }
                    drawPath(p, colour, style = st)
                }
                corner(0f, 0f, 1f, 1f); corner(w, 0f, -1f, 1f); corner(0f, h, 1f, -1f); corner(w, h, -1f, -1f)
                if (banner == null) drawLine(Bracket.copy(alpha = 0.7f), Offset(w * 0.08f, h / 2), Offset(w * 0.92f, h / 2), 2.dp.toPx())
            }
            if (ok) {
                Box(
                    Modifier.align(Alignment.Center).size(64.dp).clip(CircleShape).background(EffyRoles.brand),
                    contentAlignment = Alignment.Center,
                ) { DriverIcon(Res.drawable.lucide_check, size = 32.dp, tint = EffyRoles.brandForeground) }
            }
        }
        if (camera != null) {
            Text(
                if (camera == ScannerUnavailable.PERMISSION_REFUSED) "The camera is off for Effy Driver.\nType the codes, or tick the packages by hand."
                else "This phone has no camera to scan with.\nType the codes, or tick the packages by hand.",
                color = Bracket, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
            )
        }
        // Count, top left: "2 of 4".
        Row(
            Modifier.align(Alignment.TopStart).padding(12.dp).clip(EffyStorefrontShape.card).background(CameraChip).padding(horizontal = 10.dp, vertical = 4.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold)) { append("$scanned") }
                    withStyle(SpanStyle(fontSize = 13.sp)) { append(" of $total") }
                },
                color = Bracket,
                modifier = Modifier.semantics { contentDescription = "$scanned of $total scanned" },
            )
        }
        // Torch, top right.
        if (camera == null) {
            Box(
                Modifier.align(Alignment.TopEnd).padding(10.dp).size(DriverSize.target).clip(CircleShape).background(CameraChip)
                    .clickable(role = Role.Button, onClick = onTorch).semantics { contentDescription = if (torch) "Torch off" else "Torch on" },
                contentAlignment = Alignment.Center,
            ) { DriverIcon(if (torch) Res.drawable.lucide_flashlight_off else Res.drawable.lucide_flashlight, size = 20.dp, tint = Bracket) }
        }
        CameraBanner(banner, idleSub, Modifier.align(Alignment.BottomCenter).padding(horizontal = 12.dp, vertical = 12.dp))
    }
}

@Composable
private fun CameraBanner(b: ScanBanner?, idleSub: String?, modifier: Modifier) {
    val (bg, fg, icon, title, sub) = bannerLook(b, idleSub)
    Row(
        modifier.fillMaxWidth().clip(EffyStorefrontShape.banner).background(bg).padding(horizontal = 16.dp, vertical = 12.dp)
            .semantics { liveRegion = LiveRegionMode.Assertive },
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DriverIcon(icon, size = 22.dp, tint = fg)
        Column(Modifier.weight(1f)) {
            Text(title, color = fg, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            sub?.let { Text(it, color = fg.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

/** What the banner shows for the last read: its colours, icon and words. */
internal data class BannerLook(
    val background: androidx.compose.ui.graphics.Color,
    val ink: androidx.compose.ui.graphics.Color,
    val icon: org.jetbrains.compose.resources.DrawableResource,
    val title: String,
    val sub: String?,
)

/**
 * ⚠ A PLAIN FUNCTION ON PURPOSE — NOT INLINE IN [CameraBanner]. Written as two `when`s inside the
 * composable, Kotlin/Native (iOS) threw `NoWhenBranchMatchedException` on an exhaustive `when` the
 * moment a package counted, and the app aborted (SIGABRT) at the door — Android was fine. The same
 * `when` outside Compose is correct on iOS (`ScanBannerWhenIosTest`); `DoorScanTypedCodeIosTest` drives
 * the screen that crashed. Keep the decision here.
 */
internal fun bannerLook(b: ScanBanner?, idleSub: String?): BannerLook = when (b) {
    is ScanBanner.Counted -> BannerLook(EffyColor.Light.brand, EffyColor.Light.brandForeground, Res.drawable.lucide_circle_check, b.item?.bannerTitle ?: b.code, b.item?.bannerSub)
    is ScanBanner.Already -> BannerLook(GreyBanner, BannerInk, Res.drawable.lucide_rotate_ccw, "Already scanned", b.item?.bannerTitle)
    is ScanBanner.WrongPlace -> BannerLook(PaperBanner, BannerInk, Res.drawable.lucide_circle_alert, "This is for ${b.where}", "Don't hand it over — put it back")
    is ScanBanner.NotYours -> BannerLook(PaperBanner, BannerInk, Res.drawable.lucide_circle_x, "Not on any of your runs", "Don't take it. Call dispatch if they insist.")
    ScanBanner.NotACode -> BannerLook(PaperBanner, BannerInk, Res.drawable.lucide_circle_alert, "That isn't a package code", "The code is the six large characters on the label.")
    null -> BannerLook(CameraChip, Bracket, Res.drawable.lucide_search, "Point at a package label", idleSub)
}

// ── below the camera ───────────────────────────────────────────────────────────────────────────────

/** The hub's instruction: "PUT IT IN / LOAD NOW / Effy · Today, 4 pm – 6 pm". */
@Composable
private fun SortCard(sort: ScanSort) {
    val scheme = MaterialTheme.colorScheme
    val (bg, fg) = when (sort.swatch) {
        ScanSwatch.Blue -> scheme.primary to scheme.onPrimary
        ScanSwatch.Dark -> scheme.onSurface to scheme.surface
        ScanSwatch.Outline -> scheme.surfaceVariant to scheme.onSurface
    }
    Column(
        Modifier.fillMaxWidth().clip(EffyStorefrontShape.banner).background(bg).padding(horizontal = 20.dp, vertical = 18.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Assertive },
    ) {
        Text("PUT IT IN", color = fg.copy(alpha = 0.85f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)
        Text(sort.word, color = fg, fontSize = 40.sp, lineHeight = 44.sp, fontWeight = FontWeight.Bold)
        Text(sort.sub, color = fg.copy(alpha = 0.9f), style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun ItemRow(item: ScanItem, done: Boolean, method: HandMethod?, last: Boolean, onTick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Column {
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Checkbox, onClick = onTick)
                .semantics { stateDescription = if (done) "Scanned" else "To scan" }
                .heightIn(min = DriverSize.rowTall).padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (done) {
                Box(Modifier.size(28.dp).clip(CircleShape).background(EffyRoles.brand), contentAlignment = Alignment.Center) {
                    DriverIcon(Res.drawable.lucide_check, size = 16.dp, tint = EffyRoles.brandForeground)
                }
            } else {
                val ring = scheme.outline
                Canvas(Modifier.size(28.dp)) {
                    drawCircle(ring, radius = size.minDimension / 2 - 1.dp.toPx(), style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))))
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    item.title,
                    fontFamily = if (item.mono) effyMonoFontFamily() else null,
                    fontSize = if (item.mono) 19.sp else 18.sp,
                    fontWeight = FontWeight.Medium,
                )
                item.meta?.let { meta ->
                    val (tint, icon) = when (item.tone) {
                        RouteTone.Effy -> EffyRoles.brand to Res.drawable.lucide_truck
                        RouteTone.Courier -> scheme.primary to Res.drawable.lucide_package
                        RouteTone.None -> scheme.onSurfaceVariant to null
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                        icon?.let { DriverIcon(it, size = 14.dp, tint = tint) }
                        Text(meta, color = tint, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            Text(
                when {
                    !done -> "To scan"
                    method == HandMethod.MANUAL -> "Ticked"
                    method == HandMethod.TYPED -> "Typed"
                    else -> "Scanned"
                },
                style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant,
            )
        }
        if (!last) HorizontalDivider(color = scheme.outlineVariant)
    }
}

@Composable
private fun GroupRow(g: ScanGroup, scanned: Int, total: Int, last: Boolean) {
    val scheme = MaterialTheme.colorScheme
    val full = scanned == total && total > 0
    Column {
        Row(
            Modifier.fillMaxWidth().heightIn(min = DriverSize.rowTall).padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when {
                g.number != null -> DriverNumberCircle(
                    g.number,
                    if (full) EffyRoles.brandMuted else scheme.surfaceVariant,
                    if (full) EffyRoles.brand else scheme.onSurface,
                )
                g.swatch != null -> {
                    val shape = EffyStorefrontShape.small
                    Box(
                        Modifier.size(20.dp).clip(shape).then(
                            when (g.swatch) {
                                ScanSwatch.Blue -> Modifier.background(scheme.primary).border(1.5.dp, scheme.onSurface, shape)
                                ScanSwatch.Dark -> Modifier.background(scheme.onSurface)
                                ScanSwatch.Outline -> Modifier.border(1.5.dp, scheme.onSurface, shape)
                            },
                        ),
                    )
                }
            }
            Column(Modifier.weight(1f)) {
                Text(g.title, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                g.sub?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant) }
            }
            Text(
                "$scanned of $total",
                fontSize = 17.sp,
                fontWeight = if (g.number != null && !full) FontWeight.Normal else FontWeight.SemiBold,
                color = if (g.number != null) (if (full) EffyRoles.brand else scheme.onSurfaceVariant) else scheme.onSurface,
            )
        }
        if (!last) HorizontalDivider(color = scheme.outlineVariant)
    }
}

/** All in: a green bar counts three seconds with Undo, then the step completes by itself. */
@Composable
private fun AutoCompleteBar(count: Int, verb: String, working: Boolean, onUndo: () -> Unit, onGo: () -> Unit) {
    val clock = remember { Animatable(0f) }
    var left by remember { mutableIntStateOf(3) }
    LaunchedEffect(Unit) {
        while (left > 0) { delay(1_000); left-- }
        onGo()
    }
    LaunchedEffect(Unit) { clock.animateTo(1f, tween(3_000, easing = LinearEasing)) }
    Column(
        Modifier.fillMaxWidth().background(EffyRoles.brandMuted)
            .navigationBarsPadding()
            .padding(horizontal = DriverSize.gutter, vertical = 14.dp)
            .semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "All $count scanned — $verb." },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(EffyRoles.brand), contentAlignment = Alignment.Center) {
                DriverIcon(Res.drawable.lucide_check, size = 20.dp, tint = EffyRoles.brandForeground)
            }
            Column(Modifier.weight(1f)) {
                Text("All $count scanned — $verb…", color = EffyRoles.brand, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    if (working || left == 0) "Sending now" else "Sending in $left ${if (left == 1) "second" else "seconds"}",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!working && left > 0) DriverButton("Undo", onClick = onUndo, style = DriverButtonStyle.Outline, tall = false)
        }
        DriverProgress(clock.value, done = true)
    }
}

/** Type the code from a torn or unreadable label (redesign `05 Type the code`): six boxes, a live match. */
@Composable
private fun TypeCodeSheet(preview: (String) -> Pair<String?, Boolean>, onDismiss: () -> Unit, onAdd: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    val (line, matches) = if (code.length == 6) preview(code) else (null to false)
    DriverSheet(
        title = "Type the package code",
        description = "The 6 large characters printed beside the codes. Letters and numbers only.",
        onDismiss = onDismiss,
    ) {
        BasicTextField(
            value = code,
            onValueChange = { code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(6) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, keyboardType = KeyboardType.Ascii),
            modifier = Modifier.semantics { contentDescription = "Package code" },
            decorationBox = {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    val scheme = MaterialTheme.colorScheme
                    val shape = EffyStorefrontShape.card
                    Row(Modifier.clip(shape).border(1.dp, scheme.outline, shape)) {
                        repeat(6) { i ->
                            val active = i == code.length.coerceAtMost(5)
                            Box(
                                Modifier.width(48.dp).height(60.dp)
                                    .then(if (active) Modifier.border(2.dp, scheme.primary, EffyStorefrontShape.control) else Modifier),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(code.getOrNull(i)?.toString() ?: "", fontFamily = effyMonoFontFamily(), fontSize = 26.sp, fontWeight = FontWeight.Medium)
                            }
                            if (i < 5) Box(Modifier.width(1.dp).height(60.dp).background(scheme.outlineVariant))
                        }
                    }
                }
            },
        )
        line?.let {
            Row(
                Modifier.fillMaxWidth().clip(EffyStorefrontShape.card).background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically,
            ) {
                DriverIcon(if (matches) Res.drawable.lucide_circle_check else Res.drawable.lucide_circle_alert, size = 18.dp, tint = if (matches) EffyRoles.brand else MaterialTheme.colorScheme.onSurface)
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
        }
        DriverButton("Add package", onClick = { onAdd(code) }, enabled = code.length == 6, modifier = Modifier.fillMaxWidth())
        Text("Recorded as typed, not scanned.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}
