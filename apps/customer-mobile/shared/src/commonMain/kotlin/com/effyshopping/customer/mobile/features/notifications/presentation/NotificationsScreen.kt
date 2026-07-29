package com.effyshopping.customer.mobile.features.notifications.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.features.notifications.domain.AppNotification
import com.effyshopping.customer.mobile.features.notifications.domain.NotificationFixtures
import com.effyshopping.customer.mobile.features.notifications.domain.NotificationKind
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_account_outlined
import com.effyshopping.customer.mobile.resources.ic_cart_outlined
import com.effyshopping.customer.mobile.resources.ic_orders_outlined
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.painterResource

/**
 * Notifications (026 US4 / T068), composed to the source design's screen: date-grouped sections, each
 * row a leading icon with a bold title and a grey supporting line, hairlines between rows.
 *
 * ⚠ FIXTURE-BACKED. The platform has no notifications capability — see `NotificationFixtures`, which
 * returns an EMPTY list, so what a shopper actually sees is the empty state. That is not a stub
 * standing in for content; it is the truthful report that nothing has been sent to them (FR-035).
 */
@Composable
fun NotificationsScreen() {
    val items = NotificationFixtures.current()
    if (items.isEmpty()) NotificationsEmpty() else NotificationsList(items)
}

@Composable
private fun NotificationsList(items: List<AppNotification>) {
    // Preserve the source's grouping while keeping the order the data arrived in — `groupBy` on a
    // List does exactly that, so "Today" cannot jump below "Earlier" on a whim.
    val groups = items.groupBy { it.group }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = EffySpacing.md),
    ) {
        groups.forEach { (group, rows) ->
            item(key = "h-$group") {
                Text(
                    group,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(
                        start = EffySpacing.lg,
                        end = EffySpacing.lg,
                        top = EffySpacing.lg,
                        bottom = EffySpacing.s,
                    ),
                )
            }
            itemsIndexed(rows) { index, row ->
                NotificationRow(row)
                if (index < rows.lastIndex) EffyHairline()
            }
        }
    }
}

@Composable
private fun NotificationRow(item: AppNotification) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(EffySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Icon(
            painterResource(
                when (item.kind) {
                    NotificationKind.Order -> Res.drawable.ic_orders_outlined
                    NotificationKind.Delivery -> Res.drawable.ic_cart_outlined
                    NotificationKind.Account -> Res.drawable.ic_account_outlined
                },
            ),
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            tint = MaterialTheme.colorScheme.onSurface,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(item.title, style = MaterialTheme.typography.titleSmall)
            Text(
                item.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = EffySpacing.xs),
            )
        }
    }
}

/** The source's empty state: a centred icon, a headline, and a plain explanation. */
@Composable
private fun NotificationsEmpty() {
    Column(
        modifier = Modifier.fillMaxSize().padding(EffySpacing.xxxl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            painterResource(Res.drawable.ic_orders_outlined),
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        EffyDisplay(
            "No notifications yet",
            size = DisplaySize.Sub,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = EffySpacing.lg),
        )
        Text(
            "When there's news about an order, it'll show up here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = EffySpacing.s),
        )
    }
}
