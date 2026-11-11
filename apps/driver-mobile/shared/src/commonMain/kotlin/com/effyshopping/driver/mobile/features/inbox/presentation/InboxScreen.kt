package com.effyshopping.driver.mobile.features.inbox.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.platform.localDateIso
import com.effyshopping.driver.mobile.core.presentation.DriverButton
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverInlineBar
import com.effyshopping.driver.mobile.core.presentation.DriverLoading
import com.effyshopping.driver.mobile.core.presentation.DriverSectionLabel
import com.effyshopping.driver.mobile.core.presentation.DriverSheet
import com.effyshopping.driver.mobile.core.presentation.DriverSkeleton
import com.effyshopping.driver.mobile.core.presentation.DriverSkeletonText
import com.effyshopping.driver.mobile.core.presentation.DriverState
import com.effyshopping.driver.mobile.core.presentation.dayText
import com.effyshopping.driver.mobile.core.presentation.isoToMillis
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis
import com.effyshopping.driver.mobile.core.presentation.timeText
import com.effyshopping.driver.mobile.features.inbox.domain.InboxCategories
import com.effyshopping.driver.mobile.features.inbox.domain.InboxItem
import com.effyshopping.driver.mobile.features.inbox.domain.groupByDay
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_archive
import com.effyshopping.driver.mobile.resources.lucide_bell
import com.effyshopping.driver.mobile.resources.lucide_wifi_off
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/**
 * Notifications (110 US3): every notification about the driver's work, including ones that reached no phone - a run
 * assigned before they signed in is here, with a pinned "You have N runs today" on top. All / Unread only. Tap to open
 * the run (or Today), swipe to archive with Undo, mark all read. Opening it clears the bell on Today.
 */
@Composable
fun InboxScreen(
    state: InboxUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onUnreadOnly: (Boolean) -> Unit,
    onLoadMore: () -> Unit,
    onTap: (InboxItem) -> Unit,
    /** Recorded as read without going anywhere: a message opens its sheet first (112). */
    onRead: (InboxItem) -> Unit = {},
    onArchive: (InboxItem) -> Unit,
    onMarkAllRead: () -> Unit,
) {
    var detail by remember { mutableStateOf<InboxItem?>(null) }
    val now = remember(state.items, state.pinned) { nowEpochMillis() }
    val today = localDateIso(now)
    val yesterday = localDateIso(now - 86_400_000L)
    val dayOf: (String) -> String? = { iso -> isoToMillis(iso)?.let(::localDateIso) }

    fun tap(item: InboxItem) {
        if (item.opensDetail) {
            detail = item
            onRead(item)
        } else {
            onTap(item)
        }
    }

    Column(Modifier.fillMaxSize()) {
        DriverInlineBar(
            title = "Notifications",
            backLabel = "Today",
            onBack = onBack,
            actionLabel = if (state.anyUnread) "Read all" else null,
            onAction = if (state.anyUnread) onMarkAllRead else null,
        )
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterPill("All", selected = !state.unreadOnly) { onUnreadOnly(false) }
            FilterPill("Unread", selected = state.unreadOnly) { onUnreadOnly(true) }
        }
        when {
            state.loading -> DriverLoading(label = "Loading notifications") {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    DriverSectionLabel("Today")
                    repeat(5) { RowSkeleton() }
                }
            }
            state.loadFailed -> DriverState(
                icon = Res.drawable.lucide_wifi_off,
                title = "We couldn't load your notifications",
                body = "Check your signal and try again.",
                actionLabel = "Try again",
                onAction = onRetry,
            )
            state.empty -> DriverState(
                icon = Res.drawable.lucide_bell,
                title = if (state.unreadOnly) "Nothing unread" else "No notifications yet",
                body = if (state.unreadOnly) "You've read everything." else "When work is assigned or changed, it appears here as well as on your phone.",
                actionLabel = if (state.unreadOnly) "Show all" else null,
                onAction = if (state.unreadOnly) ({ onUnreadOnly(false) }) else null,
            )
            else -> {
                val list = rememberLazyListState()
                LaunchedEffect(list, state.nextCursor) {
                    snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
                        .distinctUntilChanged()
                        .filter { it >= list.layoutInfo.totalItemsCount - 4 }
                        .collect { onLoadMore() }
                }
                LazyColumn(state = list, modifier = Modifier.weight(1f).fillMaxWidth()) {
                    if (state.pinned.isNotEmpty()) {
                        item(key = "h-pinned") { Label("Important") }
                        items(state.pinned, key = { "p-${it.id}" }) { item -> Swipe(item, onArchive) { InboxRow(item, today, dayOf) { tap(item) } } }
                    }
                    for (group in groupByDay(state.items, today, yesterday, dayOf)) {
                        item(key = "h-${group.heading}") { Label(group.heading) }
                        items(group.items, key = { it.id }) { item -> Swipe(item, onArchive) { InboxRow(item, today, dayOf) { tap(item) } } }
                    }
                    item(key = "end") {
                        when {
                            state.loadingMore -> Column(Modifier.padding(16.dp)) { RowSkeleton() }
                            state.nextCursor == null -> Text(
                                "That's everything from the last 90 days.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(16.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    detail?.let { item ->
        DriverSheet(title = item.title, onDismiss = { detail = null }) {
            item.imageUrl?.let { url ->
                AsyncImage(
                    model = url,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(8.dp)),
                )
                Spacer(Modifier.height(16.dp))
            }
            Text(item.body, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(bottom = 24.dp))
            if (item.isMessage && item.destination != null) {
                DriverButton(label = "Open", onClick = { detail = null; onTap(item) }, modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp))
            }
        }
    }
}

@Composable
private fun Label(text: String) {
    DriverSectionLabel(text, modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp))
}

@Composable
private fun FilterPill(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.background)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = if (selected) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onSurface)
    }
}

/** Swipe towards the start to archive; screen readers get the same as a named action. */
@Composable
private fun Swipe(item: InboxItem, onArchive: (InboxItem) -> Unit, content: @Composable () -> Unit) {
    val haptics = LocalHapticFeedback.current
    val state = rememberSwipeToDismissBoxState()
    LaunchedEffect(state.currentValue) {
        if (state.currentValue == SwipeToDismissBoxValue.EndToStart) {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            onArchive(item)
        }
    }
    SwipeToDismissBox(
        state = state,
        modifier = Modifier.semantics { customActions = listOf(CustomAccessibilityAction("Archive") { onArchive(item); true }) },
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Row(
                Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DriverIcon(Res.drawable.lucide_archive, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Archive", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp))
            }
        },
    ) { content() }
}

@Composable
private fun InboxRow(item: InboxItem, today: String, dayOf: (String) -> String?, onClick: () -> Unit) {
    val day = dayOf(item.createdAt)
    val time = if (day == null) "" else if (day == today) timeText(item.createdAt) else dayText(day)
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .clickable(onClick = onClick)
            .heightIn(min = 64.dp)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .semantics { if (!item.read) contentDescription = "Unread. ${item.title}. ${item.body}. $time" },
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            DriverIcon(InboxCategories.icon(item.category), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(item.title, fontSize = 17.sp, fontWeight = if (item.read) FontWeight.Normal else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(item.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (time.isNotBlank()) Text(time, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Box(Modifier.padding(start = 8.dp, top = 6.dp).size(10.dp)) {
            if (!item.read) Box(Modifier.fillMaxSize().clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        }
    }
}

@Composable
private fun RowSkeleton() {
    Row(Modifier.padding(vertical = 12.dp), verticalAlignment = Alignment.Top) {
        DriverSkeleton(Modifier.size(40.dp), height = 40.dp)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            DriverSkeletonText(MaterialTheme.typography.titleMedium, widthFraction = 0.5f)
            DriverSkeletonText(MaterialTheme.typography.bodyMedium, widthFraction = 0.9f)
        }
    }
}
