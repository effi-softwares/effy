package com.effyshopping.customer.mobile.core.observability

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton

/**
 * The customer analytics-consent affordance (050 US4, T031). A non-blocking bottom banner shown only
 * when consent is [ConsentState.UNKNOWN]; the shopper can use the app normally behind it.
 *
 * ⚠ NO analytics SDK loads until [onAccept] (Principle VII). [onDecline] records the refusal so the
 * banner never reappears and nothing is ever collected. Both persist via [ConsentStore] and re-render
 * the shell. Crash reporting is unaffected (Q1). Copy carries no claim beyond "anonymous".
 */
@Composable
fun AnalyticsConsentBanner(
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 3.dp,
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Help improve Effy",
                style = MaterialTheme.typography.titleSmall,
            )
            Text(
                "We use privacy-friendly analytics to make the app better. No personal data is " +
                    "collected — you can change this any time in Account.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp),
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onDecline) { Text("No thanks") }
                EffyPrimaryButton(
                    label = "Allow",
                    onClick = onAccept,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}

/**
 * A persistent opt-in/out toggle for the Account screen (FR-023) — the customer's way BACK after a
 * decline, and the standing control. Reads/writes the same [ConsentState].
 */
@Composable
fun analyticsConsentSubtitle(state: ConsentState): String = when (state) {
    ConsentState.GRANTED -> "On — anonymous usage data is shared"
    ConsentState.DENIED -> "Off"
    ConsentState.UNKNOWN -> "Off"
}
