package com.effyshopping.driver.mobile.features.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.placeholder.unavailableLabel
import com.effyshopping.driver.mobile.core.theme.AppearanceMode
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus

/**
 * Account (060 US4, design screen `account`).
 *
 * ⚠ Rebuilt to the design's **single row list**. 049's version showed name, email, three detail
 * rows, an inline appearance segmented control and an outlined sign-out button — no avatar, no
 * duty-status row, and appearance had no screen of its own.
 *
 * Rows, not cards, throughout: the constitution's default and obviously right here.
 */
@Composable
fun AccountScreen(
    driver: Driver,
    appearanceMode: AppearanceMode,
    signingOut: Boolean,
    onOpenAppearance: () -> Unit,
    onOpenHelp: () -> Unit,
    onSignOut: () -> Unit,
    outstandingWork: Int? = null,
    appVersion: String = "0.1.0 (dev)",
) {
    var confirmSignOut by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Text(
            "Account",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(top = 8.dp, bottom = 22.dp),
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(driver.initials())
            Spacer(Modifier.width(16.dp))
            Column {
                Text(
                    driver.display,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    driver.workEmail,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(Modifier.height(26.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        AccountRow(
            label = "Duty status",
            value = if (driver.dutyStatus == DutyStatus.ON_DUTY) "On duty" else "Off duty",
        )
        // ⚠ Rendered as unavailable rather than blank when unassigned. A newly provisioned driver
        // has no zone, hub or vehicle, and an empty row reads as a broken screen rather than as
        // "your supervisor hasn't set this yet".
        AccountRow(label = "Delivery zone", value = driver.zone.orUnavailable())
        AccountRow(label = "Home hub", value = driver.hub.orUnavailable())
        AccountRow(label = "Vehicle", value = driver.vehicleLabel())
        AccountRow(
            label = "Appearance",
            value = when (appearanceMode) {
                AppearanceMode.Light -> "Light"
                AppearanceMode.Dark -> "Dark"
                AppearanceMode.System -> "Follow system"
            },
            onClick = onOpenAppearance,
        )
        AccountRow(label = "Help & support", value = null, onClick = onOpenHelp)
        AccountRow(
            label = "Sign out",
            value = null,
            destructive = true,
            enabled = !signingOut,
            onClick = { confirmSignOut = true },
        )

        Spacer(Modifier.height(24.dp))
        Text(
            "Effy Driver $appVersion",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text("Sign out of Effy Driver?") },
            text = {
                // ⚠ The design states the consequence for work still held. 049's copy was generic
                // ("you'll need a new code"), which tells a driver mid-run nothing about the drops
                // in their van. The count is only shown when it is actually known.
                Text(
                    buildString {
                        append("Signing out sets you off duty")
                        if (outstandingWork != null && outstandingWork > 0) {
                            append(
                                " and dispatch reassigns the $outstandingWork " +
                                    "drop${if (outstandingWork == 1) "" else "s"} you have left",
                            )
                        }
                        append(". You'll need your work email and a new code to sign back in.")
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { confirmSignOut = false; onSignOut() }) {
                    Text("Sign out", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmSignOut = false }) { Text("Stay signed in") }
            },
        )
    }
}

@Composable
private fun AccountRow(
    label: String,
    value: String?,
    destructive: Boolean = false,
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .then(
                    if (onClick != null) {
                        Modifier.clickable(enabled = enabled, onClick = onClick)
                    } else {
                        Modifier
                    },
                )
                .heightIn(min = 56.dp)
                .padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.bodyLarge,
                color = if (destructive) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                value?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (onClick != null && !destructive) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "›",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

@Composable
private fun Avatar(initials: String) {
    Box(
        Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onPrimary,
        )
    }
}

private fun String?.orUnavailable(): String =
    this?.takeIf { it.isNotBlank() } ?: unavailableLabel()

private fun Driver.vehicleLabel(): String =
    listOfNotNull(vehicle.type, vehicle.plate).joinToString(" · ").ifBlank { unavailableLabel() }

private fun Driver.initials(): String {
    val source = name.trim().ifBlank { workEmail.substringBefore("@") }
    val parts = source.split('.', '_', '-', ' ').filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> "${parts[0].first()}${parts[1].first()}"
        source.length >= 2 -> source.take(2)
        else -> "DR"
    }.uppercase()
}
