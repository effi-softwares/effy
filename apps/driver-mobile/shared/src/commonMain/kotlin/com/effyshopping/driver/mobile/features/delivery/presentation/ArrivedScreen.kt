package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.mobile.kit.ui.SwipeToConfirm

/**
 * Arrived at a drop (060 US1, design screen `arrived`).
 *
 * ⚠ **`DropStatus.ARRIVED` has existed since 049 and has never had a screen either.** Like
 * `EN_ROUTE`, the status changed and nothing about the screen did.
 *
 * The driver is now standing at the door with parcels in their hands. The screen carries exactly
 * three things: **where they are** (so a wrong building is caught before knocking), **what the
 * customer said** (repeated here even though it was on the en-route screen — a driver who read it
 * while parking has since carried two boxes up a stairwell), and **the way out** if it cannot be
 * delivered.
 *
 * ⚠ Completion is a **swipe** (FR-018): it opens proof capture and commits the delivery. A tap is
 * too cheap for an action the driver performs one-handed against a door frame.
 */
@Composable
fun ArrivedScreen(
    drop: Drop,
    working: Boolean,
    onComplete: () -> Unit,
    onCantDeliver: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(8.dp))
        StatusChip("Arrived")

        Spacer(Modifier.height(20.dp))
        Text(
            "You're at\n${drop.addressFull.substringBefore(",")}",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            "${drop.customerName} · ${drop.packages.size} " +
                "package${if (drop.packages.size == 1) "" else "s"}",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            drop.addressFull,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        drop.instructions?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(20.dp))
            InstructionCallout(it)
        }

        Spacer(Modifier.weight(1f))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // Masked contact remains unbuilt (049 R6) — disabled with a reason, not a dead button.
            OutlinedButton(
                onClick = {},
                enabled = false,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f).height(52.dp),
            ) { Text("Call customer") }
        }

        Spacer(Modifier.height(14.dp))
        SwipeToConfirm(
            label = "Swipe to complete drop",
            onConfirm = onComplete,
            enabled = !working,
        )
        Spacer(Modifier.height(4.dp))
        TextButton(
            onClick = onCantDeliver,
            enabled = !working,
            modifier = Modifier.fillMaxWidth().height(48.dp),
        ) {
            Text("Can't deliver", color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(8.dp))
    }
}
