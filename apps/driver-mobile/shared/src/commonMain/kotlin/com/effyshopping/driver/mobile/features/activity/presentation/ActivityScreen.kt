package com.effyshopping.driver.mobile.features.activity.presentation

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.activity.domain.ActivityItem

/** In-app activity feed — chronological, tap opens the related run/stop (049 US6, FR-032). */
@Composable
fun ActivityScreen(state: ActivityUiState, onBack: () -> Unit, onOpen: (ActivityItem) -> Unit) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(20.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ Back") }
            Text("Activity", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(12.dp))
        when {
            state.isLoading && state.items.isEmpty() -> Centered { CircularProgressIndicator() }
            state.isEmpty -> Centered { Text("Nothing yet. New work will show here.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            state.items.isEmpty() -> Centered { Text(state.message ?: "Couldn't load activity.") }
            else -> Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.items.forEach { item ->
                    val clickable = item.runId != null || item.dropId != null
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().let { if (clickable) it.clickable { onOpen(item) } else it },
                    ) {
                        Row(Modifier.padding(16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            if (!item.read) {
                                Surface(color = MaterialTheme.colorScheme.primary, shape = CircleShape, modifier = Modifier.size(8.dp)) {}
                                Spacer(Modifier.size(10.dp))
                            }
                            Column(Modifier.weight(1f)) {
                                Text(
                                    item.headline(),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                                )
                                Text(item.body, style = MaterialTheme.typography.bodyMedium)
                                Text(item.createdAt.take(16).replace('T', ' '), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (clickable) Text("›", style = MaterialTheme.typography.titleLarge)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

/**
 * A headline for an activity item.
 *
 * \u26a0 **DERIVED, because `ActivityItem` has no title field.** The design shows a title above the
 * body; the domain carries `type` and `body` only. Mapping the known types to a headline is honest
 * \u2014 the type IS platform data \u2014 and an unknown type falls back to a neutral label rather than
 * inventing one, so a newer producer cannot make this screen lie.
 */
private fun ActivityItem.headline(): String = when (type) {
    "run_assigned" -> "Run assigned"
    "packages_ready" -> "Packages ready"
    "window_starting" -> "Delivery window starting"
    "short_package" -> "Short package reported"
    else -> "Update"
}
