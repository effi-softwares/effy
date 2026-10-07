package com.effyshopping.driver.mobile.features.today.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.presentation.rememberIsOpen
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.domain.UpcomingRound

/**
 * The other rounds this driver holds (072) — the afternoon's collection, the evening's deliveries,
 * possibly tomorrow morning's.
 *
 * ⚠ THIS SECTION DID NOT EXIST BEFORE 072 BECAUSE THERE WAS NOTHING TO PUT IN IT. A round used to be
 * created inside the last 45 minutes before it was due, so a driver held one at a time and learned
 * the shape of each run when it was nearly on top of them. Work is now assigned the moment a driver
 * can take it; this is where they see their day.
 *
 * Rows, not cards — these ARE a set, each one line of facts (constitution Principle V).
 *
 * ⚠ EVERY ROW OPENS ITS RUN, OPEN OR NOT. Reading a round early is the point; what waits is acting
 * on it, and the run's own screens say so.
 *
 * Draws nothing when the driver holds no other round.
 */
@Composable
fun UpcomingRounds(
    rounds: List<UpcomingRound>,
    onOpenRun: (runId: String, phase: Phase) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (rounds.isEmpty()) return

    Column(modifier.fillMaxWidth()) {
        Text(
            "ALSO YOURS · ${rounds.size} round${if (rounds.size == 1) "" else "s"}",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(6.dp))

        rounds.forEach { round ->
            UpcomingRow(round, onClick = { onOpenRun(round.runId, round.phase) })
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

@Composable
private fun UpcomingRow(round: UpcomingRound, onClick: () -> Unit) {
    val isCollection = round.phase == Phase.COLLECTION
    // Re-judged while the screen is up, so "Opens 1:15 pm" becomes "Open now" by itself.
    val open = rememberIsOpen(round.opening)

    val place = if (isCollection) "shop" else "drop"
    val counts =
        "${round.stopCount} $place${if (round.stopCount == 1) "" else "s"} · " +
            "${round.packageCount} package${if (round.packageCount == 1) "" else "s"}"
    // ⚠ In words. "Open now" and "Opens …" differ by text, not by colour.
    val whenLine = (if (open) "Open now" else (round.opening?.sentence ?: "Not open yet")) +
        " · ${if (isCollection) "collect" else "deliver"} by ${round.dueLabel}"

    Row(
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            // ⚠ A fat-finger target: a driver taps this with a parcel under one arm.
            .heightIn(min = 64.dp)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                if (isCollection) "Collection run" else "Same-day delivery",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                whenLine,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (open) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                counts,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text("›", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
