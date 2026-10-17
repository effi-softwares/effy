package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import org.jetbrains.compose.resources.DrawableResource

/**
 * An empty, error or "no longer yours" state — centred, always saying what happens next (the canvas's
 * Patterns: "Empty — always says what happens next"; "Error — we take the blame, and offer a retry").
 */
@Composable
fun DriverState(
    icon: DrawableResource,
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    actionIcon: DrawableResource? = null,
    /** The action as the primary (blue) button — "Back to Today" on a stop that was moved. */
    primaryAction: Boolean = false,
) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // The redesign's state icon: a 48 dp muted rounded square.
        Box(Modifier.size(48.dp).clip(EffyStorefrontShape.card).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            DriverIcon(icon, size = 22.dp)
        }
        Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), textAlign = TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 320.dp))
        if (actionLabel != null && onAction != null) {
            DriverButton(
                actionLabel, onClick = onAction,
                style = if (primaryAction) DriverButtonStyle.Primary else DriverButtonStyle.Outline,
                icon = actionIcon, tall = false, modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

/** A loading placeholder bar — skeletons take the shape of the list they stand in for. */
@Composable
fun DriverSkeleton(modifier: Modifier = Modifier, height: Dp = 16.dp) {
    Box(modifier.height(height).clip(EffyStorefrontShape.small).background(MaterialTheme.colorScheme.surfaceVariant))
}
