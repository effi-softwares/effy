package com.effyshopping.customer.mobile.features.notifications.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.platform.rememberClearAppBadge
import com.effyshopping.customer.mobile.core.platform.rememberOpenAppSettings
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyChip
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffyGroup
import com.effyshopping.customer.mobile.core.presentation.EffyNavRow
import com.effyshopping.customer.mobile.core.presentation.EffyRowIcon
import com.effyshopping.customer.mobile.core.presentation.EffySectionHeader
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonText
import com.effyshopping.customer.mobile.core.presentation.EffySwipeRow
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.features.notifications.domain.InboxCategories
import com.effyshopping.customer.mobile.features.notifications.domain.InboxFilter
import com.effyshopping.customer.mobile.features.notifications.domain.InboxGrouping
import com.effyshopping.customer.mobile.features.notifications.domain.InboxItem
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_bell
import com.effyshopping.customer.mobile.resources.lucide_settings
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.live.LiveKind
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.painterResource

/**
 * Notifications (110 US1): everything Effy told the shopper, newest first, grouped by day on Effy's clock, important
 * ones pinned on top. All / Unread and the categories they have items in. Tap to open what it is about (and it is read);
 * swipe to archive, with Undo; mark all read. Opening it clears the bell. Live: a new notification appears without a
 * refresh, and nothing is re-read on a timer.
 *
 * [onOpen] routes an item's destination through the shell's push router; an item this build cannot open shows its
 * detail sheet instead (FR-013). No centred dialog, no drop-down (customer app rule).
 */
@Composable
fun InboxScreen(container: AppContainer, snackbar: SnackbarHostState, onOpen: (InboxItem) -> Unit) {
    val clearAppBadge = rememberClearAppBadge()
    val vm = viewModel {
        InboxViewModel(
            inbox = container.inbox,
            liveChanges = container.live.changes(LiveKind.INBOX),
            onCount = container.inboxBadge::set,
            track = container.analyticsDriver::capture,
            clearAppBadge = clearAppBadge,
        )
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val openSettings = rememberOpenAppSettings()
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<InboxItem?>(null) }
    val now = remember(state.items, state.pinned) { kotlin.time.Clock.System.now().toEpochMilliseconds() }

    fun tap(item: InboxItem) {
        vm.opened(item)
        if (item.destination != null) onOpen(item) else detail = item
    }

    fun archive(item: InboxItem) {
        val archived = vm.archive(item) ?: return
        scope.launch {
            val result = snackbar.showSnackbar("Notification archived", actionLabel = "Undo", duration = SnackbarDuration.Short)
            if (result == SnackbarResult.ActionPerformed) vm.undo(archived)
        }
    }

    Column(Modifier.fillMaxSize()) {
        EffyAppBar(title = "Notifications")
        FilterRow(state, onFilter = vm::selectFilter, onCategory = vm::selectCategory, onMarkAllRead = vm::markAllRead)
        when {
            state.loading -> InboxSkeleton()
            state.loadFailed -> EffyErrorState(title = "We couldn't load your notifications", onRetry = vm::load)
            state.empty && state.filtered -> EffyEmptyState(
                title = "Nothing here",
                body = if (state.filter == InboxFilter.UNREAD) "You've read everything." else "No notifications of this kind yet.",
                icon = Res.drawable.lucide_bell,
                actionLabel = "Show all",
                onAction = { vm.selectFilter(InboxFilter.ALL) },
                modifier = Modifier.weight(1f),
            )
            state.empty -> Column(Modifier.weight(1f)) {
                EffyEmptyState(
                    title = "You're all caught up",
                    body = "When there's news about an order or your points, we'll tell you here and on your phone.",
                    icon = Res.drawable.lucide_bell,
                    modifier = Modifier.weight(1f),
                )
                SettingsRow(openSettings)
            }
            else -> {
                val list = rememberLazyListState()
                LaunchedEffect(list, state.nextCursor) {
                    snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
                        .distinctUntilChanged()
                        .filter { it >= list.layoutInfo.totalItemsCount - 4 }
                        .collect { vm.loadMore() }
                }
                LazyColumn(state = list, modifier = Modifier.weight(1f).fillMaxWidth()) {
                    if (state.pinned.isNotEmpty()) {
                        item(key = "h-pinned") { EffySectionHeader("Important", modifier = Modifier.padding(top = EffySpacing.md)) }
                        items(state.pinned, key = { "p-${it.id}" }) { item ->
                            EffySwipeRow(onSwiped = { archive(item) }) { InboxRow(item, now, onClick = { tap(item) }) }
                        }
                    }
                    for (group in InboxGrouping.group(state.items, now)) {
                        item(key = "h-${group.heading}") { EffySectionHeader(group.heading, modifier = Modifier.padding(top = EffySpacing.md)) }
                        items(group.items, key = { it.id }) { item ->
                            EffySwipeRow(onSwiped = { archive(item) }) { InboxRow(item, now, onClick = { tap(item) }) }
                        }
                    }
                    item(key = "end") {
                        when {
                            state.loadingMore -> Column(Modifier.padding(EffySpacing.lg)) { RowSkeleton() }
                            state.nextCursor == null -> Text(
                                "That's everything from the last 6 months.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.fillMaxWidth().padding(EffySpacing.lg),
                            )
                        }
                    }
                    item(key = "settings") { SettingsRow(openSettings) }
                }
            }
        }
    }

    detail?.let { item ->
        EffySheet(title = item.title, onDismiss = { detail = null }, cancelLabel = "Close") {
            Text(item.body, style = MaterialTheme.typography.bodyLarge)
            item.endsLabel?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = EffySpacing.s))
            }
        }
    }
}

@Composable
private fun FilterRow(
    state: InboxUiState,
    onFilter: (InboxFilter) -> Unit,
    onCategory: (String) -> Unit,
    onMarkAllRead: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = EffySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            EffyChip("All", selected = state.filter == InboxFilter.ALL && state.category == null, onClick = { onFilter(InboxFilter.ALL) })
            EffyChip("Unread", selected = state.filter == InboxFilter.UNREAD, onClick = { onFilter(InboxFilter.UNREAD) })
            for (chip in state.chips) {
                EffyChip(chip.label, selected = state.category == chip.key, onClick = { onCategory(chip.key) })
            }
        }
        if (state.anyUnread) {
            Box(Modifier.fillMaxWidth().padding(horizontal = EffySpacing.s), contentAlignment = Alignment.CenterEnd) {
                EffyTextLink("Mark all read", onClick = onMarkAllRead)
            }
        }
    }
}

@Composable
private fun InboxRow(item: InboxItem, now: Long, onClick: () -> Unit) {
    val time = InboxGrouping.timeLabel(item, now)
    val meta = listOfNotNull(time.ifBlank { null }, item.endsLabel).joinToString(" · ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .clickable(onClick = onClick)
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md)
            .semantics { if (!item.read) contentDescription = "Unread. ${item.title}. ${item.body}. $meta" },
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(painterResource(InboxCategories.icon(item.category)), contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(Modifier.weight(1f).padding(start = EffySpacing.md)) {
            Text(
                item.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = if (item.read) FontWeight.Normal else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                item.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (meta.isNotBlank()) {
                Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
            }
        }
        Box(Modifier.padding(start = EffySpacing.s, top = 6.dp).size(10.dp)) {
            if (!item.read) Box(Modifier.fillMaxSize().clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        }
    }
}

@Composable
private fun SettingsRow(openSettings: () -> Unit) {
    EffyGroup(modifier = Modifier.padding(EffySpacing.lg)) {
        EffyNavRow(
            "Notification settings",
            leading = { EffyRowIcon(Res.drawable.lucide_settings) },
            supporting = "Choose what your phone shows from Effy",
            onClick = openSettings,
            divider = false,
        )
    }
}

/** The inbox's own shape while it loads: a heading and rows with an icon, a title and two lines (skeleton rule). */
@Composable
private fun InboxSkeleton() {
    Column(Modifier.fillMaxWidth().padding(top = EffySpacing.md)) {
        Text("Today", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s))
        repeat(6) { Column(Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md)) { RowSkeleton() } }
    }
}

@Composable
private fun RowSkeleton() {
    Row(verticalAlignment = Alignment.Top) {
        EffySkeletonBlock(Modifier.size(40.dp), radius = 20.dp)
        Column(Modifier.weight(1f).padding(start = EffySpacing.md)) {
            EffySkeletonText(MaterialTheme.typography.titleSmall, widthFraction = 0.5f)
            EffySkeletonText(MaterialTheme.typography.bodyMedium, widthFraction = 0.9f)
            Spacer(Modifier.size(2.dp))
            EffySkeletonText(MaterialTheme.typography.bodySmall, widthFraction = 0.25f)
        }
    }
}
