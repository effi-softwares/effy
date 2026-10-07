package com.effyshopping.driver.mobile.core.presentation

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
import com.effyshopping.driver.mobile.core.opening.Opening
import com.effyshopping.driver.mobile.core.opening.isOpenAt
import kotlinx.coroutines.delay
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

@OptIn(ExperimentalTime::class)
private fun nowMillis(): Long = Clock.System.now().toEpochMilliseconds()

/**
 * Whether a round is open RIGHT NOW, re-judged while the screen stays up (072 FR-026).
 *
 * A driver parked outside a shop with the stop on screen must see the controls come alive when the
 * round opens, without touching anything.
 *
 * ⚠ THIS IS A CLOCK, NOT A REFRESH. It re-reads NOTHING — it compares an instant the app already
 * holds with the time, exactly as `WindowLine` turns "Due now" into "Late". 071 forbids a screen
 * re-reading its data on a timer (`scripts/check-no-refresh-timers.sh`); a loop that only re-words
 * what is already loaded is the case that rule allows, and the loop below must stay that way.
 *
 * ⚠ Checked every 15 seconds, and once more exactly when the moment is due, so the wait after the
 * opening time is never longer than a blink.
 */
@Composable
fun rememberIsOpen(opening: Opening?): Boolean {
    val open by produceState(initialValue = opening.isOpenAt(nowMillis()), opening) {
        while (!value && opening != null) {
            val wait = (opening.atEpochMillis - nowMillis()).coerceIn(250L, 15_000L)
            delay(wait)
            value = opening.isOpenAt(nowMillis())
        }
    }
    return open
}

/**
 * "Opens 1:15 pm" — shown wherever a round's actions are unavailable because it has not opened.
 *
 * ⚠ SAID IN WORDS, WITH A MARK IN FRONT. Colour is not used at all: this is not an error and not
 * time pressure, it is simply not yet. A greyed-out button with no explanation is a dead end; this
 * line is the explanation (FR-025).
 *
 * Draws NOTHING once the round is open.
 */
@Composable
fun OpensLine(
    opening: Opening?,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyMedium,
) {
    if (opening == null || rememberIsOpen(opening)) return
    Row(
        modifier = modifier.semantics(mergeDescendants = true) {
            contentDescription = "Not open yet. ${opening.sentence}."
        },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The mark is part of the words, so the state survives a monochrome screen in sunlight.
        Text("◷", style = style, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(8.dp))
        Text(
            "Not open yet · ${opening.sentence}",
            style = style,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
