package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.theme.EffyRoles
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import org.jetbrains.compose.resources.DrawableResource

/** The canvas's three alert looks. */
enum class DriverAlertKind {
    /** Grey — a state to know about (offline, a later run, live updates paused). */
    Muted,
    /** Blue tint — saved and sending, opens at, a dispatch change. */
    Info,
    /** Black outline — something the driver must act on (not recorded, notifications off). Never red. */
    Problem,
}

/**
 * An alert or banner. Connection banners stack at the top of a screen and push the content down —
 * they never cover it (the canvas's Patterns).
 */
@Composable
fun DriverAlert(
    kind: DriverAlertKind,
    icon: DrawableResource,
    title: String,
    modifier: Modifier = Modifier,
    description: String? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    val shape = EffyStorefrontShape.card
    val (bg, iconTint) = when (kind) {
        DriverAlertKind.Muted -> scheme.surfaceVariant to scheme.onSurface
        DriverAlertKind.Info -> EffyRoles.primaryMuted to scheme.primary
        DriverAlertKind.Problem -> scheme.background to scheme.onSurface
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(bg)
            .then(if (kind == DriverAlertKind.Problem) Modifier.border(1.5.dp, scheme.onSurface, shape) else Modifier)
            .padding(14.dp)
            .semantics { liveRegion = if (kind == DriverAlertKind.Problem) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        DriverIcon(icon, tint = iconTint, size = 18.dp, modifier = Modifier.padding(top = 2.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = scheme.onSurface)
            if (description != null) {
                Text(description, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant)
            }
            if (actions != null) {
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = actions)
            }
        }
    }
}
