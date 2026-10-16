package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.theme.EffyRoles

/**
 * Every status a driver screen says — "one word, one look" (the canvas's Foundations). Green only means
 * done; blue is the next thing to do; a problem is black (with its word), never red or orange.
 */
enum class DriverStatus(val word: String) {
    Next("Next"),
    ToCollect("To collect"),
    Collected("Collected"),
    Delivered("Delivered"),
    DueNow("Due now"),
    Late("Late"),
    Short("Short"),
    NotDelivered("Not delivered"),
    Last("Last"),
    CheckedIn("Checked in"),
    OutForDelivery("Out for delivery"),
}

private enum class Look { Blue, Green, Grey, Outline, Black }

private fun DriverStatus.look(): Look = when (this) {
    DriverStatus.Next, DriverStatus.OutForDelivery -> Look.Blue
    DriverStatus.Collected, DriverStatus.Delivered, DriverStatus.CheckedIn -> Look.Green
    DriverStatus.ToCollect -> Look.Grey
    DriverStatus.DueNow -> Look.Outline
    DriverStatus.Late, DriverStatus.Short, DriverStatus.NotDelivered, DriverStatus.Last -> Look.Black
}

/** A status pill (always fully rounded). */
@Composable
fun DriverStatusPill(status: DriverStatus, modifier: Modifier = Modifier, label: String = status.word) {
    val scheme = MaterialTheme.colorScheme
    val (bg, fg) = when (status.look()) {
        Look.Blue -> EffyRoles.primaryMuted to scheme.primary
        Look.Green -> EffyRoles.brandMuted to EffyRoles.brand
        Look.Grey -> scheme.surfaceVariant to scheme.onSurface
        Look.Outline -> Color.Transparent to scheme.onSurface
        Look.Black -> scheme.onSurface to scheme.surface
    }
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(bg)
            .then(if (status.look() == Look.Outline) Modifier.border(1.dp, scheme.outline, CircleShape) else Modifier)
            .padding(horizontal = 10.dp, vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium), color = fg, maxLines = 1)
    }
}
