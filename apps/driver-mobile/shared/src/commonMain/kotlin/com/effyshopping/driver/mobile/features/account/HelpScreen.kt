package com.effyshopping.driver.mobile.features.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.placeholder.unavailableLabel
import com.effyshopping.driver.mobile.features.driver.domain.Driver

/**
 * Help & support (060 US4, design screen `help`).
 *
 * ⚠ **The app had NO help screen at all.** A driver who needed dispatch had nowhere in the app to
 * find them — which is the single most likely thing a driver needs and could not get.
 *
 * ⚠ **And the most important thing on it is still missing, deliberately.** The design supplies a
 * dispatch phone number (`1800 EFFY OPS`). It is sample content, and the constitution requires an
 * outward-facing identifier to be operator-supplied rather than inferred. It renders as unavailable
 * with a line saying where to get it instead. A plausible wrong number is worse than a blank one:
 * the driver dials it.
 */
@Composable
fun HelpScreen(driver: Driver, onBack: () -> Unit, appVersion: String = "0.1.0 (dev)") {
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        AccountSubHeader("Help", onBack)

        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            HelpRow("Call dispatch", unavailableLabel())
            HelpRow("Hub desk", unavailableLabel())
            HelpRow("Driver handbook", unavailableLabel())
            HelpRow("Your hub", driver.hub?.takeIf { it.isNotBlank() } ?: unavailableLabel())
            HelpRow("Your zone", driver.zone?.takeIf { it.isNotBlank() } ?: unavailableLabel())
            HelpRow("App version", appVersion)

            Spacer(Modifier.height(22.dp))
            Text(
                "Dispatch contact details haven't been set up in the app yet. Until they are, use " +
                    "the number your supervisor gave you at induction.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun HelpRow(label: String, value: String) {
    Column {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            Text(
                value,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}
