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
 * Whether a round is open right now, re-judged while the screen stays up, so the controls come alive at
 * opening time. A clock, not a refresh: it compares an instant already held with the time and re-reads
 * nothing (the case `scripts/check-no-refresh-timers.sh` allows; keep it so). Checked every 15 seconds and
 * once exactly when due.
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

