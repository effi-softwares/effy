package com.effyshopping.driver.mobile.features.today.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.domain.TodayItem

/**
 * The current stop or drop — the one thing a driver looks at while holding a parcel (060 US1,
 * design screens `home` / `home-delivery`).
 *
 * ⚠ **A RECORDED CARD EXCEPTION.** Constitution Principle V forbids card layouts "unless a card is
 * demonstrably the right pattern for that specific content and no better layout exists, in which
 * case the plan MUST record the justification". The justification (plan Complexity Tracking,
 * research R12): this is **one object, not a tile in a set**, and it carries a map strip above a
 * title, an address and a metrics row as a single tappable target. A detail row cannot contain a
 * map. Everything else on this screen is rows and sections.
 *
 * ⚠ **THE METRICS ROW OMITS WHAT IT CANNOT KNOW.** The design reads "6 packages · 0.6 km · ETA
 * 9:38"; distance and ETA are `PLACEHOLDER_OPERATIONAL` (no routing engine, no coordinates — 049
 * R13). They are **omitted**, not rendered as "—": in an inline dot-separated row a string of
 * dashes reads as a broken screen, whereas a labelled column reads as "not available" (which is why
 * the off-duty stats row *does* use the dash). Same rule, opposite rendering, because the context
 * differs — see FR-015.
 */
@Composable
fun CurrentWorkCard(
    phase: Phase,
    item: TodayItem,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isCollection = phase == Phase.COLLECTION
    val kicker = if (isCollection) "CURRENT STOP" else "CURRENT DROP"
    val actionChip = if (isCollection) "Collect" else "Deliver"

    Column(modifier.fillMaxWidth()) {
        Text(
            kicker,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(10.dp))

        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surface,
            // Bordered, never shadowed — constitution Principle V.
            border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.onSurface),
            modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        ) {
            Column {
                MapStrip()

                Column(Modifier.padding(16.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            item.title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.height(0.dp))
                        ActionChip(actionChip)
                    }

                    item.subtitle?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Spacer(Modifier.height(12.dp))

                    // Only what the platform actually knows. Distance and ETA are omitted above.
                    Text(
                        item.status.replace('_', ' ').replaceFirstChar { c -> c.uppercase() },
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/**
 * The card's map band.
 *
 * ⚠ A neutral panel, not a map — real OpenStreetMap cartography arrives in Phase 5, and even then
 * the pins are placeholder because the platform holds no coordinates (register: `heroMapStrip`).
 * It reserves the space deliberately rather than collapsing, so the layout a driver learns now does
 * not shift under them when the map lands.
 */
@Composable
private fun MapStrip() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(106.dp)
            .clip(RoundedCornerShape(topStart = 13.dp, topEnd = 13.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "Map view coming soon",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ActionChip(label: String) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface),
    ) {
        Text(
            label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 5.dp),
        )
    }
}
