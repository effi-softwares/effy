package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.EffyMapCanvas
import com.effyshopping.driver.mobile.core.platform.MAP_ATTRIBUTION
import com.effyshopping.driver.mobile.features.delivery.domain.Drop

/**
 * En route to a drop (060 US1, design screen `enroute`).
 *
 * ⚠ **`DropStatus.EN_ROUTE` has existed since 049 and has never had a screen.** The driver tapped a
 * button on the detail screen and the status changed with no visible consequence — the same layout
 * with a different button. This is the state given a face.
 *
 * The screen answers one question while the driver is moving: *where am I going, and what do I need
 * to know before I get there?* So the address is large, the delivery instructions are impossible to
 * miss, and the only actions are navigate, contact, and arrive.
 */
@Composable
fun EnRouteScreen(
    drop: Drop,
    working: Boolean,
    onNavigate: (String) -> Unit,
    onArrived: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        MapPanel()

        Column(
            Modifier.weight(1f).padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            StatusChip("En route", pulsing = true)

            Column {
                Text(
                    drop.addressFull.substringBefore(","),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    drop.addressFull.substringAfter(",", "").trim().ifBlank { drop.customerName },
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "${drop.customerName} · ${drop.packages.size} " +
                        "package${if (drop.packages.size == 1) "" else "s"}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // ⚠ Not a footnote. A buzzer that does not work, or "do not leave with the concierge",
            // is the difference between a delivery and a failed one — and the driver reads this
            // while parking.
            drop.instructions?.takeIf { it.isNotBlank() }?.let { InstructionCallout(it) }

            Spacer(Modifier.weight(1f))

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(
                    onClick = { onNavigate(drop.addressFull) },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f).height(52.dp),
                ) { Text("Navigate ↗") }
                // ⚠ Masked contact is still unbuilt (049 R6) — a disabled control with a stated
                // reason, never a button that silently does nothing.
                OutlinedButton(
                    onClick = {},
                    enabled = false,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f).height(52.dp),
                ) { Text("Call") }
            }
            Text(
                "Calling a customer without showing their number isn't built yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Button(
                onClick = onArrived,
                enabled = !working,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text(
                    "I've arrived",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

/**
 * \u26a0 Real OpenStreetMap cartography, **with no route drawn on it**. The platform has no
 * coordinates for a customer address (049 R13), so there is no line to draw and no pin to place.
 * It orients the driver; **Navigate** does the routing, with the real address string.
 */
@Composable
internal fun MapPanel(height: androidx.compose.ui.unit.Dp = 220.dp) {
    Box(Modifier.fillMaxWidth().height(height)) {
        EffyMapCanvas(Modifier.fillMaxSize())
        Surface(
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.align(Alignment.BottomEnd),
        ) {
            Text(
                MAP_ATTRIBUTION,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
internal fun StatusChip(label: String, pulsing: Boolean = false) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Box(
                Modifier.size(7.dp).background(MaterialTheme.colorScheme.primary, CircleShape),
            )
            Text(
                label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
internal fun InstructionCallout(text: String) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Text("!", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(12.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
