package com.effyshopping.customer.mobile.features.tracking.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.mobile.design.EffySpacing

/**
 * The stages a customer is shown, in order. These mirror 020's `shop_fulfillment` state machine
 * (`pending → received → picking → ready_for_pickup → delivered`) in customer-facing words.
 */
enum class TrackStage(val label: String, val detail: String) {
    Placed("Order placed", "We've got your order."),
    Preparing("Preparing", "Your items are being picked and packed."),
    ReadyToLeave("Ready to leave", "Packed and waiting for collection."),
    OnItsWay("On its way", "Your order is out for delivery."),
    Delivered("Delivered", "Your order has arrived."),
}

/**
 * Order tracking (026 US4 / T069) — the source design's Track Order screen, **substantially adapted**.
 *
 * ── ⚠ WHAT WAS REMOVED, AND WHY IT HAD TO BE ────────────────────────────────────────────────────
 *
 * The source screen is the single clearest case in the whole kit of "adapt, never reproduce"
 * (FR-007). Three of its four elements are FORBIDDEN here by FR-037 / SC-012:
 *
 *  1. **The map.** It plots the warehouse, the courier and the destination. Effy's fulfilment nodes
 *     are hidden by the product model — a customer never learns which shop served them — and a map
 *     pin is the most direct possible disclosure of one.
 *  2. **The per-stage addresses.** The source prints a street address under "Packing" and "Picked".
 *     Those ARE the fulfilment node's address. Only the DESTINATION — the address the customer
 *     themselves gave us — may be shown, and it is shown once rather than per stage.
 *  3. **The named courier with a photo and a call button.** Drivers are Effy employees; the platform
 *     does not expose their identity to customers, and there is no capability behind that button.
 *
 * What survives is the part that was actually good: a vertical progress timeline with a filled node
 * per completed stage. That maps cleanly onto real 020 state, so this screen — unlike Notifications —
 * renders **real data, not fixtures**.
 *
 * ⚠ Progress is conveyed by FILL + WEIGHT + the connector's solidity, never by colour alone (FR-040):
 * a completed stage has a filled dot, a semibold label and a solid connector; a future stage has a
 * hollow dot, a regular label and a faint connector.
 */
@Composable
fun TrackOrderScreen(
    currentStage: TrackStage,
    destination: String?,
    modifier: Modifier = Modifier,
    packageLabel: String? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
    ) {
        EffyDisplay("Order status", size = DisplaySize.Section)

        // Positional labelling only — "Package 1 of 2" never says WHERE either package came from,
        // which is the same rule the cart already follows (FR-043).
        if (packageLabel != null) {
            Text(
                packageLabel,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Column {
            TrackStage.entries.forEachIndexed { index, stage ->
                StageRow(
                    stage = stage,
                    reached = index <= currentStage.ordinal,
                    isLast = index == TrackStage.entries.lastIndex,
                )
            }
        }

        // The destination is the ONLY address on this screen, and it is the customer's own.
        if (destination != null) {
            Column {
                Text(
                    "Delivering to",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    destination,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(top = EffySpacing.xs),
                )
            }
        }
    }
}

@Composable
private fun StageRow(stage: TrackStage, reached: Boolean, isLast: Boolean) {
    Row(modifier = Modifier.fillMaxWidth()) {
        // The rail: a dot, and a connector down to the next stage.
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(24.dp)) {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .then(
                        if (reached) {
                            Modifier.background(MaterialTheme.colorScheme.primary, CircleShape)
                        } else {
                            Modifier.border(2.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                        },
                    ),
            )
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(48.dp)
                        .background(
                            if (reached) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.outlineVariant
                            },
                        ),
                )
            }
        }

        Column(modifier = Modifier.weight(1f).padding(start = EffySpacing.md, bottom = EffySpacing.lg)) {
            Text(
                stage.label,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = if (reached) FontWeight.SemiBold else FontWeight.Normal,
                ),
                color = if (reached) {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            Text(
                stage.detail,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = EffySpacing.xs),
            )
        }
    }
    if (isLast) Spacer(Modifier.height(EffySpacing.s))
}
