package com.effyshopping.driver.mobile.features.account

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.theme.AppearanceMode
import com.effyshopping.driver.mobile.features.driver.domain.Driver

/**
 * Account (049 FR-035/036/037): identity, zone, hub, vehicle as DETAIL ROWS (never cards, Principle V),
 * an appearance selector (Light/Dark/Follow-System), and sign out behind a confirm dialog.
 */
@Composable
fun AccountScreen(
    driver: Driver,
    appearanceMode: AppearanceMode,
    onAppearanceModeChange: (AppearanceMode) -> Unit,
    signingOut: Boolean,
    onSignOut: () -> Unit,
    appVersion: String = "0.1.0 (dev)",
) {
    var confirmSignOut by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(driver.display, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Text(driver.workEmail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

        DetailRows(
            "Delivery zone" to (driver.zone ?: "Unassigned"),
            "Hub" to (driver.hub ?: "—"),
            "Vehicle" to vehicleLabel(driver),
        )

        SectionLabel("Appearance")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            AppearanceMode.entries.forEach { mode ->
                AppearanceChoice(
                    label = when (mode) {
                        AppearanceMode.Light -> "Light"
                        AppearanceMode.Dark -> "Dark"
                        AppearanceMode.System -> "System"
                    },
                    selected = appearanceMode == mode,
                    onClick = { onAppearanceModeChange(mode) },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        SectionLabel("Help")
        DetailRows("App version" to appVersion)

        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = { confirmSignOut = true },
            enabled = !signingOut,
            shape = RoundedCornerShape(13.dp),
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) { Text("Sign out") }
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text("Sign out?") },
            text = { Text("You'll need your work email and a new code to sign back in.") },
            confirmButton = {
                TextButton(onClick = { confirmSignOut = false; onSignOut() }) { Text("Sign out") }
            },
            dismissButton = { TextButton(onClick = { confirmSignOut = false }) { Text("Cancel") } },
        )
    }
}

private fun vehicleLabel(driver: Driver): String {
    val t = driver.vehicle.type
    val p = driver.vehicle.plate
    return listOfNotNull(t, p).joinToString(" · ").ifBlank { "—" }
}

@Composable
private fun DetailRows(vararg rows: Pair<String, String>) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(10.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            rows.forEachIndexed { i, (label, value) ->
                Row(
                    modifier = Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label, style = MaterialTheme.typography.bodyLarge)
                    Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (i < rows.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun AppearanceChoice(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(10.dp),
        modifier = modifier.height(48.dp).clickable(onClick = onClick),
    ) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
