package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
import com.effyshopping.mobile.kit.ui.SwipeToConfirm

/**
 * 088 — the parcels from failed drops, still in the van, and the one action that checks them all back
 * in at the hub. Shown on Today (when it is the only work left on the round) and at the foot of the run.
 *
 * ⚠ Order numbers only: the driver matches them to the labels in the van; no address, no customer.
 */
@Composable
fun ReturnToHubBlock(
    toReturn: ParcelsToReturn,
    working: Boolean,
    message: String?,
    onReturn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val parcels = if (toReturn.count == 1) "1 parcel" else "${toReturn.count} parcels"
    Column(modifier.fillMaxWidth()) {
        Text("Return to hub", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text(
            "$parcels from deliveries that couldn't be made are still with you. " +
                "Check them back in when you're at the hub.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(10.dp))
        toReturn.orders.forEach { order ->
            Text(order, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(vertical = 4.dp))
        }
        message?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(14.dp))
        // Keyed on the message so a refused return hands back a fresh swipe to retry with.
        key(message) {
            SwipeToConfirm(label = "Swipe to return $parcels", onConfirm = onReturn, enabled = !working)
        }
    }
}
