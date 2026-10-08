package com.effyshopping.customer.mobile.features.points.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.points.domain.PointsLine
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.live.LiveKind

/**
 * Effy points (074 US1) — the balance and every change to it.
 *
 * ⚠ A LIST OF ROWS, NEVER CARDS (Principle V); the balance is a heading line, not a tile.
 */
@Composable
fun PointsScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = viewModel { PointsViewModel(container.getPoints, container.getOlderPoints, container.live.changes(LiveKind.POINTS)) }
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { container.analyticsDriver.capture(AnalyticsEvent.PointsViewed) }

    Scaffold { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Text("Effy points", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = EffySpacing.lg))
            Text(
                "Points are credit from Effy. Use them on anything at checkout, delivery included. They have no cash value.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            val balance = state.balance
            when {
                state.loading -> Centered { CircularProgressIndicator() }
                state.loadFailed || balance == null -> Centered {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                        Text(
                            "We couldn't load your points just now.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                        TextButton(onClick = vm::load) { Text("Try again") }
                    }
                }
                else -> {
                    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                        Text("${formatPoints(balance.points)} points", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                        Text("Worth \$${balance.valueAmount}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        balance.nextExpiry?.let {
                            Text(
                                "${formatPoints(it.points)} can be used until ${DeliveryWindowText.formatDay(it.date)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (state.lines.isEmpty()) {
                        Text(
                            "You don't have any points yet. If Effy gives you points, they'll show up here.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        LazyColumn {
                            items(state.lines, key = { it.id }) { line ->
                                LineRow(line)
                                HorizontalDivider()
                            }
                            if (state.nextCursor != null) {
                                item {
                                    TextButton(onClick = vm::loadOlder, enabled = !state.loadingOlder) {
                                        Text(if (state.loadingOlder) "Loading…" else "Show older")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LineRow(line: PointsLine) {
    val credit = line.points > 0
    val day = DeliveryWindowText.epochMillisOrNull(line.at)?.let { DeliveryWindowText.formatDay(DeliveryWindowText.melbourneDay(it)) } ?: ""
    Row(Modifier.fillMaxWidth().padding(vertical = EffySpacing.md), horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
        Column(Modifier.weight(1f)) {
            Text(line.words, style = MaterialTheme.typography.bodyLarge)
            Text(
                if (credit && line.usableUntil != null) "$day · use by ${DeliveryWindowText.formatDay(line.usableUntil)}" else day,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            (if (credit) "+" else "−") + formatPoints(kotlin.math.abs(line.points)),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = if (credit) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

/** "1,250" — grouped thousands, no locale API needed. */
internal fun formatPoints(n: Long): String = n.toString().reversed().chunked(3).joinToString(",").reversed()
