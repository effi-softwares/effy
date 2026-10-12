package com.effyshopping.driver.mobile.features.account

import androidx.compose.foundation.clickable
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.placeholder.unavailableLabel
import com.effyshopping.driver.mobile.features.driver.domain.Driver

/**
 * Help & support (060 US4, design screen `help`).
 *
 * ⚠ The contacts are OPERATOR-SUPPLIED at build time (`DISPATCH_PHONE`, `HUB_DESK_PHONE`,
 * `HANDBOOK_URL`) and never sample content: a number a driver would dial is a real-world identifier.
 * One that has not been supplied shows as unavailable, with a line saying where to get it — a
 * plausible wrong number is worse than a blank one, because the driver dials it.
 */
@Composable
fun HelpScreen(
    driver: Driver,
    onBack: () -> Unit,
    appVersion: String?,
    dispatchPhone: String? = null,
    hubDeskPhone: String? = null,
    handbookUrl: String? = null,
    onDial: (String) -> Unit = {},
    onOpenLink: (String) -> Unit = {},
) {
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        AccountSubHeader("Help", onBack)

        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            HelpRow("Call dispatch", dispatchPhone ?: unavailableLabel(), dispatchPhone?.let { { onDial(it) } })
            HelpRow("Hub desk", hubDeskPhone ?: unavailableLabel(), hubDeskPhone?.let { { onDial(it) } })
            HelpRow("Driver handbook", if (handbookUrl != null) "Open" else unavailableLabel(), handbookUrl?.let { { onOpenLink(it) } })
            HelpRow("Your hub", driver.hub?.takeIf { it.isNotBlank() } ?: unavailableLabel())
            HelpRow("Your zone", driver.zone?.takeIf { it.isNotBlank() } ?: unavailableLabel())
            HelpRow("App version", appVersion?.takeIf { it.isNotBlank() } ?: unavailableLabel())

            if (dispatchPhone == null) {
                Spacer(Modifier.height(22.dp))
                Text(
                    "Dispatch contact details haven't been set up in the app yet. Until they are, use " +
                        "the number your supervisor gave you at induction.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun HelpRow(label: String, value: String, onClick: (() -> Unit)? = null) {
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .let { if (onClick != null) it.clickable(role = Role.Button, onClick = onClick) else it }
                .heightIn(min = 56.dp)
                .padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            Text(
                value,
                style = MaterialTheme.typography.bodyLarge,
                // A row that does something is said in the action colour, so it is not mistaken for a label.
                color = if (onClick != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}
