package com.effyshopping.customer.mobile.features.points.presentation

import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.PaddingValues
import com.effyshopping.customer.mobile.resources.lucide_info
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.core.presentation.EffySize
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyNotice
import com.effyshopping.customer.mobile.core.presentation.EffyNumberRoll
import com.effyshopping.customer.mobile.core.presentation.EffyCard
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffyLoading
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonText
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
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
 * Effy points - the balance and every change to it.
 *
 * The storefront identity permits cards (constitution v3.3.0): the balance is a card, the
 * history stays a list of rows.
 */
@Composable
fun PointsScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = viewModel { PointsViewModel(container.getPoints, container.getOlderPoints, container.live.changes(LiveKind.POINTS)) }
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { container.analyticsDriver.capture(AnalyticsEvent.PointsViewed) }

    // 087 (Points board): a pushed page with Back (it had none - FR-029), the balance in a card, the
    // history as rows below it, pull to refresh.
    Column(Modifier.fillMaxSize()) {
        EffyAppBar(title = "Effy points")
        val balance = state.balance
        when {
            state.loading -> PointsSkeleton()
            state.loadFailed || balance == null -> EffyErrorState(
                title = "We couldn't load your points",
                onRetry = vm::load,
            )
            else -> EffyPullToRefresh(onRefresh = { vm.load() }, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(EffySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
                ) {
                    item(key = "balance") {
                        EffyCard {
                            Text("Your balance", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            EffyNumberRoll(
                                "${formatPoints(balance.points)} points",
                                style = MaterialTheme.typography.displaySmall.copy(fontFeatureSettings = "tnum"),
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text("Worth ${money(balance.valueAmount, "AUD")}", style = MaterialTheme.typography.bodyLarge)
                            balance.nextExpiry?.let {
                                Text(
                                    "${formatPoints(it.points)} can be used until ${DeliveryWindowText.formatDay(it.date)}. " +
                                        "Use them at checkout before then.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = EffySpacing.xs),
                                )
                            }
                        }
                    }
                    item(key = "about") {
                        EffyNotice(
                            "Points are credit from Effy. Use them on anything at checkout, delivery included. They have no cash value.",
                            icon = Res.drawable.lucide_info,
                        )
                    }
                    if (state.lines.isEmpty()) {
                        item(key = "empty") {
                            Text(
                                "You don't have any points yet. If Effy gives you points, they'll show up here.",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        item(key = "history") {
                            Text("History", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = EffySpacing.s))
                        }
                        items(state.lines, key = { it.id }) { line ->
                            Column(Modifier.animateItem()) {
                                LineRow(line)
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            }
                        }
                        if (state.nextCursor != null) {
                            item(key = "older") {
                                EffySecondaryButton(
                                    if (state.loadingOlder) "Loading…" else "Show older",
                                    onClick = vm::loadOlder,
                                    enabled = !state.loadingOlder,
                                    loading = state.loadingOlder,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** The page before it reads: the balance card (its label is fixed), the notice, and history rows as [LineRow] draws them. */
@Composable
private fun PointsSkeleton() {
    val type = MaterialTheme.typography
    EffyLoading(Modifier.fillMaxSize(), label = "Loading your points") {
        Column(Modifier.fillMaxSize().padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
            EffyCard {
                Text("Your balance", style = type.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                EffySkeletonText(type.displaySmall, Modifier.fillMaxWidth(), widthFraction = 0.55f)
                EffySkeletonText(type.bodyLarge, Modifier.fillMaxWidth(), widthFraction = 0.3f)
            }
            EffyNotice(
                "Points are credit from Effy. Use them on anything at checkout, delivery included. They have no cash value.",
                icon = Res.drawable.lucide_info,
            )
            Column {
                Text("History", style = type.titleSmall, modifier = Modifier.padding(top = EffySpacing.s))
                repeat(4) { i ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = EffySize.row).padding(vertical = EffySpacing.md),
                        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            EffySkeletonText(type.bodyLarge, Modifier.fillMaxWidth(), widthFraction = if (i % 2 == 0) 0.6f else 0.45f)
                            EffySkeletonText(type.bodySmall, Modifier.fillMaxWidth(), widthFraction = 0.3f)
                        }
                        EffySkeletonText(type.bodyLarge, Modifier.width(48.dp))
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
    Row(Modifier.fillMaxWidth().heightIn(min = EffySize.row).padding(vertical = EffySpacing.md), horizontalArrangement = Arrangement.spacedBy(EffySpacing.md), verticalAlignment = Alignment.CenterVertically) {
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
            style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = "tnum"),
            fontWeight = FontWeight.SemiBold,
            // A credit is good news - Effy green (the storefront's savings colour). A use is plain.
            color = if (credit) EffyRoles.brand else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

/** "1,250" - grouped thousands, no locale API needed. */
internal fun formatPoints(n: Long): String = n.toString().reversed().chunked(3).joinToString(",").reversed()
