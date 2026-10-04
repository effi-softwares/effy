package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryWindow
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.WindowState
import com.effyshopping.driver.mobile.features.delivery.domain.windowNote
import kotlinx.coroutines.delay
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

@OptIn(ExperimentalTime::class)
private fun nowMillis(): Long = Clock.System.now().toEpochMilliseconds()

/**
 * The delivery window the customer was sold, and whether it is open or missed (069 US4).
 *
 * ⚠ SAID IN WORDS. "Due now" and "Late" are text with a mark in front; colour reinforces and is never
 * the only signal — a driver reads this in a van, in sunlight, at a glance.
 *
 * ⚠ RE-JUDGED EVERY HALF MINUTE. A driver parked outside with this screen open must see "Due now"
 * become "Late" without touching anything; a state computed once on load would be a stale claim.
 *
 * Draws NOTHING when the drop has no window — an order placed before 069 was promised a day and
 * nothing finer, and a placeholder would look like a window that failed to load.
 */
@Composable
fun WindowLine(
    window: DeliveryWindow?,
    status: DropStatus,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyMedium,
) {
    window ?: return
    val now by produceState(initialValue = nowMillis(), window) {
        while (true) {
            delay(30_000)
            value = nowMillis()
        }
    }
    val (label, state) = windowNote(window, status, now) ?: return

    Row(
        modifier = modifier.semantics(mergeDescendants = true) {
            contentDescription = if (state.word.isEmpty()) "Deliver $label" else "Deliver $label. ${state.word}."
        },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Deliver $label", style = style, fontWeight = FontWeight.SemiBold)
        if (state.word.isNotEmpty()) {
            Spacer(Modifier.width(10.dp))
            Text(
                // The mark is part of the word, so the state survives a monochrome screen.
                (if (state == WindowState.Late) "! " else "• ") + state.word,
                style = style,
                fontWeight = FontWeight.SemiBold,
                color = if (state == WindowState.Late) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
        }
    }
}
