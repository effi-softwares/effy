package com.effyshopping.driver.mobile.features.today.presentation

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
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.today.domain.Phase

/**
 * The phase-aware home (049 FR-021). Off duty → a calm "start shift". On duty → the current PHASE
 * (Collection run / Same-day run) with the active stop/drop and a counts-only remaining total. No
 * currency ever (FR-013). The primary action is large and bottom-anchored (FR-016/044).
 */
@Composable
fun TodayScreen(
    driver: Driver,
    state: TodayUiState,
    onToggleDuty: () -> Unit,
    onRefresh: () -> Unit,
    onOpenRun: (runId: String, phase: Phase) -> Unit = { _, _ -> },
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(20.dp),
    ) {
        Text(
            "Morning, ${driver.display}",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            if (state.dutyStatus == DutyStatus.ON_DUTY) "On duty" else "Off duty",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(24.dp))

        when {
            state.dutyStatus == DutyStatus.OFF_DUTY -> OffDutyBody()
            state.isLoading -> Centered { CircularProgressIndicator() }
            state.today == null || state.today.phase == Phase.IDLE -> IdleBody()
            else -> OnDutyBody(state)
        }

        val today = state.today
        if (state.dutyStatus == DutyStatus.ON_DUTY && today != null && today.activeRunId != null && today.phase != Phase.IDLE) {
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = { onOpenRun(today.activeRunId, today.phase) },
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text(
                    if (today.phase == Phase.COLLECTION) "Open collection run" else "Open delivery run",
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }

        Spacer(Modifier.weight(1f))

        state.message?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(bottom = 12.dp),
            )
        }

        // Primary action, bottom-anchored, 56dp (fat-finger, FR-016/044).
        Button(
            onClick = onToggleDuty,
            enabled = !state.isTogglingDuty,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().height(56.dp),
        ) {
            Text(
                if (state.dutyStatus == DutyStatus.ON_DUTY) "Go off duty" else "Go on duty",
                style = MaterialTheme.typography.titleMedium,
            )
        }
        if (state.dutyStatus == DutyStatus.ON_DUTY) {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onRefresh,
                shape = RoundedCornerShape(13.dp),
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) { Text("Refresh") }
        }
    }
}

@Composable
private fun OffDutyBody() {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Start your shift", style = MaterialTheme.typography.titleLarge)
            Text(
                "Go on duty to start receiving your collection round and same-day deliveries.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun IdleBody() {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("You're all caught up", style = MaterialTheme.typography.titleLarge)
            Text(
                "Waiting for the next assignment.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun OnDutyBody(state: TodayUiState) {
    val today = state.today ?: return
    val phaseLabel = when (today.phase) {
        Phase.COLLECTION -> "Collection run"
        Phase.SAME_DAY_DELIVERY -> "Same-day delivery run"
        Phase.IDLE -> "Idle"
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // The two-up phase indicator (FR-021).
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            PhaseChip("Collection", today.phase == Phase.COLLECTION, Modifier.weight(1f))
            PhaseChip("Same-day", today.phase == Phase.SAME_DAY_DELIVERY, Modifier.weight(1f))
        }
        Text(
            "${today.remainingCount} stops remaining today",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        today.active?.let { item ->
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(phaseLabel.uppercase(), style = MaterialTheme.typography.labelSmall)
                    Text(item.title, style = MaterialTheme.typography.titleLarge)
                    item.subtitle?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun PhaseChip(label: String, active: Boolean, modifier: Modifier = Modifier) {
    Surface(
        color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(10.dp),
        modifier = modifier.height(44.dp),
    ) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                textAlign = TextAlign.Center,
                color = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) { content() }
}
