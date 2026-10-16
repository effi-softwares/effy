package com.effyshopping.driver.mobile.features.account

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.rememberTurnOnNotifications
import com.effyshopping.driver.mobile.core.presentation.DriverAlert
import com.effyshopping.driver.mobile.core.presentation.DriverAlertKind
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverButtonStyle
import com.effyshopping.driver.mobile.core.presentation.DriverDetailRow
import com.effyshopping.driver.mobile.core.presentation.DriverGroup
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverLargeTitleBar
import com.effyshopping.driver.mobile.core.presentation.DriverRow
import com.effyshopping.driver.mobile.core.presentation.DriverSectionLabel
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverSize
import com.effyshopping.driver.mobile.core.theme.AppearanceMode
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_bell
import com.effyshopping.driver.mobile.resources.lucide_chevron_right
import com.effyshopping.driver.mobile.resources.lucide_circle_help
import com.effyshopping.driver.mobile.resources.lucide_external_link
import com.effyshopping.driver.mobile.resources.lucide_file_text
import com.effyshopping.driver.mobile.resources.lucide_log_out
import com.effyshopping.driver.mobile.resources.lucide_map_pin
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_refresh_ccw
import com.effyshopping.driver.mobile.resources.lucide_smartphone

/** Who the driver is, their work set-up, this phone's settings, help and sign out (canvas `Account`). */
@Composable
fun AccountScreen(
    driver: Driver,
    appearanceMode: AppearanceMode,
    onAppearanceChange: (AppearanceMode) -> Unit,
    signingOut: Boolean,
    onOpenHelp: () -> Unit,
    onSignOut: () -> Unit,
    appVersion: String?,
    dispatchPhone: String?,
    hubDeskPhone: String?,
    handbookUrl: String?,
    onDial: (String) -> Unit,
    onOpenLink: (String) -> Unit,
    /** Stops and drops still on the driver's run, for the sign-out sheet; null when not known. */
    outstandingWork: Int? = null,
    /** 088 — parcels from failed drops still with the driver. */
    parcelsToReturn: Int? = null,
    /** Updates saved on this phone and not sent yet — lost if the driver signs out now. */
    pendingUpdates: Int = 0,
    /** Backlog F3 — whether usage analytics are on; null hides the row. */
    analyticsOn: Boolean? = null,
    onToggleAnalytics: () -> Unit = {},
) {
    var confirmSignOut by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        DriverLargeTitleBar("Account")
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = DriverSize.gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(56.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                    Text(driver.initials(), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                }
                Column {
                    Text(driver.display, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold))
                    Text("${driver.workEmail} · Driver", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            Column {
                DriverSectionLabel("Your work")
                DriverGroup {
                    // A field the record does not have is left out, never filled with a stand-in.
                    driver.hub?.takeIf { it.isNotBlank() }?.let { DriverDetailRow("Hub", it) }
                    driver.vehicleLabel()?.let { DriverDetailRow("Vehicle", it) }
                    DriverDetailRow("Duty", if (driver.dutyStatus == DutyStatus.ON_DUTY) "On duty" else "Off duty", last = true)
                }
                Text(
                    "Wrong hub or vehicle? Ask dispatch to change it. Go on or off duty from Today.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }

            Column {
                DriverSectionLabel("This phone")
                DriverGroup {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Appearance", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium))
                        AppearanceSegments(appearanceMode, onAppearanceChange)
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    val turnOn = rememberTurnOnNotifications()
                    DriverRow(
                        title = "Notifications",
                        meta = if (turnOn != null) "Off — you won't hear about new work" else null,
                        onClick = turnOn,
                        leading = { DriverIcon(Res.drawable.lucide_bell, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                        trailing = { Text(if (turnOn != null) "Turn on" else "On", color = if (turnOn != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) },
                        last = analyticsOn == null,
                    )
                    if (analyticsOn != null) {
                        DriverRow(
                            title = "Usage analytics",
                            meta = "Helps us improve the app. Never your location.",
                            onClick = onToggleAnalytics,
                            trailing = { Text(if (analyticsOn) "On" else "Off", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            last = true,
                        )
                    }
                }
            }

            Column {
                DriverSectionLabel("Help")
                DriverGroup {
                    if (dispatchPhone != null) {
                        DriverRow("Call dispatch", meta = "For anything about today's work", onClick = { onDial(dispatchPhone) },
                            leading = { DriverIcon(Res.drawable.lucide_smartphone, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                            trailing = { DriverIcon(Res.drawable.lucide_chevron_right, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant) })
                    }
                    if (hubDeskPhone != null) {
                        DriverRow("Call the hub desk", meta = driver.hub?.takeIf { it.isNotBlank() }, onClick = { onDial(hubDeskPhone) },
                            leading = { DriverIcon(Res.drawable.lucide_map_pin, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                            trailing = { DriverIcon(Res.drawable.lucide_chevron_right, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant) })
                    }
                    if (handbookUrl != null) {
                        DriverRow("Driver handbook", meta = "Opens in your browser", onClick = { onOpenLink(handbookUrl) },
                            leading = { DriverIcon(Res.drawable.lucide_file_text, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                            trailing = { DriverIcon(Res.drawable.lucide_external_link, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant) })
                    }
                    DriverRow("Help and common questions", onClick = onOpenHelp, last = true,
                        leading = { DriverIcon(Res.drawable.lucide_circle_help, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                        trailing = { DriverIcon(Res.drawable.lucide_chevron_right, size = 16.dp, tint = MaterialTheme.colorScheme.onSurfaceVariant) })
                }
            }

            DriverButton(
                "Sign out",
                onClick = { confirmSignOut = true },
                style = DriverButtonStyle.Outline,
                icon = Res.drawable.lucide_log_out,
                enabled = !signingOut,
                loading = signingOut,
                tall = false,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                listOfNotNull("Effy Driver", appVersion?.takeIf { it.isNotBlank() }?.let { "Version $it" }).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            )
        }
    }

    if (confirmSignOut) {
        SignOutSheet(
            outstandingWork = outstandingWork,
            parcelsToReturn = parcelsToReturn,
            pendingUpdates = pendingUpdates,
            onConfirm = { confirmSignOut = false; onSignOut() },
            onDismiss = { confirmSignOut = false },
        )
    }
}

/** Match phone / Light / Dark, inline (the canvas has no separate appearance screen). */
@Composable
private fun AppearanceSegments(mode: AppearanceMode, onChange: (AppearanceMode) -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier.fillMaxWidth().clip(EffyStorefrontShape.card).background(scheme.surfaceVariant).padding(4.dp).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        listOf(AppearanceMode.System to "Match phone", AppearanceMode.Light to "Light", AppearanceMode.Dark to "Dark").forEach { (m, label) ->
            val on = m == mode
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(EffyStorefrontShape.control)
                    .background(if (on) scheme.background else scheme.surfaceVariant)
                    .then(if (on) Modifier.border(1.dp, scheme.outlineVariant, EffyStorefrontShape.control) else Modifier)
                    .selectable(selected = on, role = Role.RadioButton, onClick = { onChange(m) }),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium))
            }
        }
    }
}

/** "Sign out of Effy Driver?" — names what is still held and what has not sent (canvas `SignOut`). */
@Composable
private fun SignOutSheet(
    outstandingWork: Int?,
    parcelsToReturn: Int?,
    pendingUpdates: Int,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    DriverSheet(
        title = "Sign out of Effy Driver?",
        description = "You'll go off duty and stop getting work notifications on this phone.",
        onDismiss = onDismiss,
    ) {
        if (outstandingWork != null && outstandingWork > 0) {
            DriverAlert(
                DriverAlertKind.Muted, Res.drawable.lucide_package,
                title = "You still have $outstandingWork ${if (outstandingWork == 1) "stop" else "stops"} on your run",
                description = "Dispatch will be told and may give ${if (outstandingWork == 1) "it" else "them"} to someone else.",
            )
        }
        if (parcelsToReturn != null && parcelsToReturn > 0) {
            DriverAlert(
                DriverAlertKind.Muted, Res.drawable.lucide_package,
                title = "${if (parcelsToReturn == 1) "1 parcel" else "$parcelsToReturn parcels"} to return to the hub",
                description = "Check ${if (parcelsToReturn == 1) "it" else "them"} in at the hub before you finish.",
            )
        }
        if (pendingUpdates > 0) {
            DriverAlert(
                DriverAlertKind.Problem, Res.drawable.lucide_refresh_ccw,
                title = if (pendingUpdates == 1) "1 update hasn't sent yet" else "$pendingUpdates updates haven't sent yet",
                description = "Wait for signal first, or ${if (pendingUpdates == 1) "it" else "they"} will be lost when you sign out.",
            )
        }
        DriverButton("Sign out", onClick = onConfirm, style = DriverButtonStyle.Problem, modifier = Modifier.fillMaxWidth())
        DriverButton("Stay signed in", onClick = onDismiss, style = DriverButtonStyle.Ghost, tall = false, modifier = Modifier.fillMaxWidth())
    }
}

private fun Driver.vehicleLabel(): String? =
    listOfNotNull(vehicle.type, vehicle.plate).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { null }

private fun Driver.initials(): String {
    val source = name.trim().ifBlank { workEmail.substringBefore("@") }
    val parts = source.split('.', '_', '-', ' ').filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> "${parts[0].first()}${parts[1].first()}"
        source.length >= 2 -> source.take(2)
        else -> "DR"
    }.uppercase()
}
