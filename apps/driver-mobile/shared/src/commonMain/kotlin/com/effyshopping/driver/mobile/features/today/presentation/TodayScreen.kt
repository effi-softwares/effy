package com.effyshopping.driver.mobile.features.today.presentation

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.placeholder.unavailableLabel
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import com.effyshopping.mobile.kit.ui.SkeletonBlock
import com.effyshopping.mobile.kit.ui.SkeletonLine
import com.effyshopping.mobile.kit.ui.SkeletonSquare

/**
 * The phase-aware home (060 US1 — design screens `offduty`, `home`, `home-delivery`, `home-empty`).
 *
 * Rebuilt from 049's functional scaffolding. What changed: off duty is now the design's full
 * greeting screen rather than a small panel; the phase bar carries each phase's own detail instead
 * of two bare labels; and on duty the driver gets a current-stop hero plus the rest of the round,
 * neither of which existed.
 *
 * ⚠ No currency, ever (FR-011). Every number here is a count.
 */
@Composable
fun TodayScreen(
    driver: Driver,
    state: TodayUiState,
    onToggleDuty: () -> Unit,
    onRefresh: () -> Unit,
    onOpenRun: (runId: String, phase: Phase) -> Unit = { _, _ -> },
    onOpenActivity: () -> Unit = {},
    reducedMotion: Boolean = false,
) {
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        Header(
            driver = driver,
            state = state,
            onToggleDuty = onToggleDuty,
            onOpenActivity = onOpenActivity,
        )

        EffyPullToRefresh(
            onRefresh = { onRefresh() },
            modifier = Modifier.weight(1f),
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp),
            ) {
                when {
                    state.dutyStatus == DutyStatus.OFF_DUTY -> OffDutyBody(driver)
                    state.isLoading && state.today == null -> TodaySkeleton(reducedMotion)
                    state.loadFailed -> LoadFailedBody(onRefresh)
                    state.today == null || state.today.phase == Phase.IDLE -> IdleBody(reducedMotion)
                    else -> OnDutyBody(state, driver, onOpenRun)
                }
                Spacer(Modifier.height(24.dp))
            }
        }

        Footer(state = state, onToggleDuty = onToggleDuty)
    }
}

// ── Header ──────────────────────────────────────────────────────────────────────────────────────

@Composable
private fun Header(
    driver: Driver,
    state: TodayUiState,
    onToggleDuty: () -> Unit,
    onOpenActivity: () -> Unit,
) {
    val onDuty = state.dutyStatus == DutyStatus.ON_DUTY
    Column {
        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 8.dp, bottom = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    if (onDuty) "Today" else "Effy Driver",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                if (onDuty) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        stopsLabel(state),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            TextButton(onClick = onOpenActivity) { Text("Activity") }
            DutyPill(onDuty = onDuty)
        }

        // ⚠ The offline state the app has never had an interface for. The write queue has existed
        // since 049 (FR-040); a driver in a loading dock could not tell whether the app was broken
        // or the signal was.
        if (state.offline) OfflineBanner(state.cachedAt)
    }
}

/** A count, never a currency (FR-011). */
private fun stopsLabel(state: TodayUiState): String {
    val today = state.today ?: return "Waiting for your first run"
    val n = today.remainingCount
    return when {
        today.phase == Phase.IDLE -> "No run assigned"
        n == 0 -> "Nothing left on this run"
        n == 1 -> "1 stop remaining today"
        else -> "$n stops remaining today"
    }
}

/**
 * ⚠ A STATUS INDICATOR, not a control — deliberately.
 *
 * The design makes this pill tap-to-go-off-duty. It is not wired that way here for two reasons: the
 * footer already carries an explicit, full-width "Go off duty" button, and a small pill in the
 * header is exactly the thing a driver brushes with a thumb while holding a parcel — silently
 * ending their shift. Two controls for one irreversible-ish action, one of them accidental, is not
 * a trade worth making.
 *
 * ⚠ The first draft of this function TOOK `enabled` and `onClick` and used neither, which renders
 * a control that looks interactive and does nothing — 054's decorative-tabs defect. The parameters
 * are gone rather than left unused.
 */
@Composable
private fun DutyPill(onDuty: Boolean) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = if (onDuty) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        border = if (onDuty) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.heightIn(min = 48.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Box(
                Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(
                        if (onDuty) {
                            MaterialTheme.colorScheme.onPrimary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    ),
            )
            Text(
                if (onDuty) "ON DUTY" else "OFF DUTY",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = if (onDuty) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

@Composable
private fun OfflineBanner(cachedAt: String?) {
    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                Modifier.size(7.dp).clip(CircleShape)
                    .background(MaterialTheme.colorScheme.onErrorContainer),
            )
            Column {
                Text(
                    "No connection — showing your last synced run",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
                cachedAt?.let {
                    Text(
                        "Last synced ${it.take(16).replace('T', ' ')}. Anything you confirm now " +
                            "uploads when you reconnect.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
        }
    }
}

// ── Bodies ──────────────────────────────────────────────────────────────────────────────────────

@Composable
private fun OffDutyBody(driver: Driver) {
    Column(Modifier.fillMaxWidth().padding(top = 32.dp)) {
        // ⚠ The design's "Wednesday 22 Aug · Melbourne". The DATE is omitted: this app has no
        // date-formatting dependency and 060 adds no capability for a label. The zone is real.
        driver.zone?.takeIf { it.isNotBlank() }?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
        }

        // ⚠ The design reads "Morning, Jomo." The TIME OF DAY is dropped — it needs a clock this
        // app has no dependency for — but the name is real PLATFORM data and personalisation is the
        // point of the screen, so it stays.
        Text(
            "Hello,\n${driver.display.substringBefore(' ')}.",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(14.dp))
        Text(
            "Go on duty and Effy assigns your first collection run — a round of shops, then " +
                "check-in at the hub.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(28.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(18.dp))

        // ⚠ BOTH figures are PLACEHOLDER_OPERATIONAL — there is no shift model and no completed-stop
        // count. They render as "—" rather than a number, because showing `0` after a full shift
        // would tell a driver their work did not register. The dash is legible HERE (a labelled
        // column reads as "not available") where it would not be in the hero's inline metrics row.
        Row(horizontalArrangement = Arrangement.spacedBy(32.dp)) {
            ShiftStat("Stops done", unavailableLabel())
            ShiftStat("Shift length", unavailableLabel())
        }
    }
}

@Composable
private fun ShiftStat(label: String, value: String) {
    Column {
        Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text(
            label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun OnDutyBody(
    state: TodayUiState,
    driver: Driver,
    onOpenRun: (String, Phase) -> Unit,
) {
    val today = state.today ?: return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        PhaseBar(today.phase)

        today.active?.let { item ->
            CurrentWorkCard(
                phase = today.phase,
                item = item,
                onOpen = { today.activeRunId?.let { onOpenRun(it, today.phase) } },
            )
        }

        UpNextList(
            phase = today.phase,
            items = today.upNext,
            hubName = driver.hub,
            onOpenRun = { today.activeRunId?.let { onOpenRun(it, today.phase) } },
        )

        state.message?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        }
    }
}

/**
 * The two-phase indicator (060 US1 acceptance 2).
 *
 * ⚠ Each half carries its own detail line now. 049's version was two bare labels, which told the
 * driver which phase they were in but nothing about either.
 */
@Composable
private fun PhaseBar(phase: Phase) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.fillMaxWidth()) {
            PhaseHalf(
                kicker = "PHASE 1",
                title = "Collection run",
                meta = if (phase == Phase.COLLECTION) "In progress" else "Done",
                active = phase == Phase.COLLECTION,
                modifier = Modifier.weight(1f),
            )
            Box(
                Modifier
                    .width(1.dp)
                    .height(74.dp)
                    .background(MaterialTheme.colorScheme.outlineVariant),
            )
            PhaseHalf(
                kicker = "PHASE 2",
                title = "Same-day run",
                meta = if (phase == Phase.SAME_DAY_DELIVERY) "In progress" else "Locked until check-in",
                active = phase == Phase.SAME_DAY_DELIVERY,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun PhaseHalf(
    kicker: String,
    title: String,
    meta: String,
    active: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .background(
                if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
            )
            .padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val fg = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
        Text(
            kicker,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = fg.copy(alpha = 0.7f),
        )
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = fg)
        Text(meta, style = MaterialTheme.typography.bodySmall, color = fg.copy(alpha = 0.75f))
    }
}

@Composable
private fun IdleBody(reducedMotion: Boolean) {
    val alpha by if (reducedMotion) {
        androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(1f) }
    } else {
        rememberInfiniteTransition(label = "idle").animateFloat(
            initialValue = 0.35f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1800), RepeatMode.Reverse),
            label = "idle-pulse",
        )
    }

    Column(
        Modifier.fillMaxWidth().padding(top = 72.dp, start = 20.dp, end = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.size(56.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Box(
                    Modifier
                        .size(22.dp)
                        .alpha(alpha)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary),
                )
            }
        }
        Text(
            "You're all caught up",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            "No run assigned right now. Stay on duty — your next collection run arrives here and " +
                "buzzes your phone.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Text(
            "Pull down to refresh",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Design screen `error` — a named failure and a way out, not a red line of text in place. */
@Composable
private fun LoadFailedBody(onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(top = 72.dp, start = 16.dp, end = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(2.dp, MaterialTheme.colorScheme.error),
            modifier = Modifier.size(54.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("!", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.error)
            }
        }
        Text(
            "Couldn't load your run",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            "Effy's dispatch didn't respond. Your stops are safe — try again.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onRetry,
            shape = RoundedCornerShape(13.dp),
            modifier = Modifier.heightIn(min = 52.dp),
        ) { Text("Retry") }
    }
}

/**
 * Design screen `skeleton`.
 *
 * ⚠ Built from the SAME primitives as [OnDutyBody] — a phase bar, a hero, then rows. 028 recorded
 * why: a skeleton assembled from different containers than its content cannot line up with it.
 */
@Composable
private fun TodaySkeleton(reducedMotion: Boolean) {
    Column(Modifier.fillMaxWidth().padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        SkeletonBlock(height = 74.dp, reducedMotion = reducedMotion)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SkeletonLine(widthFraction = 0.3f, height = 11.dp, reducedMotion = reducedMotion)
            SkeletonBlock(height = 212.dp, corner = 14.dp, reducedMotion = reducedMotion)
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SkeletonLine(widthFraction = 0.4f, height = 11.dp, reducedMotion = reducedMotion)
            repeat(3) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SkeletonSquare(size = 34.dp, reducedMotion = reducedMotion)
                    Spacer(Modifier.size(14.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SkeletonLine(widthFraction = 0.52f, reducedMotion = reducedMotion)
                        SkeletonLine(widthFraction = 0.78f, height = 11.dp, reducedMotion = reducedMotion)
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

// ── Footer ──────────────────────────────────────────────────────────────────────────────────────

/** The primary action, bottom-anchored and fat-fingered (049 FR-016/044, 060 FR-008). */
@Composable
private fun Footer(state: TodayUiState, onToggleDuty: () -> Unit) {
    val onDuty = state.dutyStatus == DutyStatus.ON_DUTY
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)) {
        Button(
            onClick = onToggleDuty,
            enabled = !state.isTogglingDuty,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(if (onDuty) 56.dp else 62.dp),
        ) {
            Text(
                if (onDuty) "Go off duty" else "Go on duty",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
