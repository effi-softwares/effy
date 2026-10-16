package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.rememberTurnOnNotifications

/**
 * "Notifications are off" (backlog D5). A driver who refused the prompt is told what they miss and
 * where to turn them on — the app asks once, and never again by itself. Draws nothing when they are on.
 */
@Composable
fun NotificationsOffRow(modifier: Modifier = Modifier) {
    val turnOn = rememberTurnOnNotifications() ?: return
    Column(
        modifier
            .fillMaxWidth()
            .clickable(onClick = turnOn)
            .heightIn(min = 56.dp)
            .padding(vertical = 12.dp),
    ) {
        Text(
            "Notifications are off",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            "You won't hear when work is assigned. Tap to turn them on in Settings.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
