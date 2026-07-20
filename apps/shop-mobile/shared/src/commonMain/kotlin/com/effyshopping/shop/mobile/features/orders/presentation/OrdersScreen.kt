package com.effyshopping.shop.mobile.features.orders.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.design.EffySpacing
import com.effyshopping.shop.mobile.features.orders.domain.AdvanceFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.DeliveryContext
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentDetail
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentItem
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentState
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentSummary
import com.effyshopping.shop.mobile.features.orders.domain.FulfillmentTransition
import com.effyshopping.shop.mobile.features.orders.domain.GetFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.ListFulfillments
import com.effyshopping.shop.mobile.features.orders.domain.QueueState
import com.effyshopping.shop.mobile.features.orders.domain.RecordItemProgress
import kotlinx.coroutines.delay

/**
 * The Orders route (020). Owns the ViewModel and the queue heartbeat; everything below it is stateless.
 *
 * [initialOrderId] is set when the operator pushed the `OrderDetail` nav route (the compact/phone path) — it
 * survives configuration change and iOS process death because the route is a `@Serializable` `AppNavKey`, so
 * a restored app reopens the exact portion the operator was picking.
 */
@Composable
fun OrdersRoute(
    listFulfillments: ListFulfillments,
    getFulfillment: GetFulfillment,
    advanceFulfillment: AdvanceFulfillment,
    recordItemProgress: RecordItemProgress,
    initialOrderId: String? = null,
    onOpenOrder: (String) -> Unit = {},
    onCloseOrder: () -> Unit = {},
) {
    // Keyed by the portion so that pushing OrderDetail(b) after OrderDetail(a) does not reuse a's ViewModel
    // (the ViewModelStore outlives the composable, and the default key is the call site alone).
    val viewModel = viewModel(key = "orders-${initialOrderId ?: "queue"}") {
        OrdersViewModel(listFulfillments, getFulfillment, advanceFulfillment, recordItemProgress, initialOrderId)
    }
    val state by viewModel.state.collectAsState()

    // The queue heartbeat (FR-004). It lives in the composition, so leaving the screen cancels it — there is
    // no path by which this keeps polling in the background.
    LaunchedEffect(viewModel) {
        while (true) {
            delay(QueueRefreshIntervalMillis)
            viewModel.refreshQueue()
        }
    }

    OrdersScreen(
        state = state,
        onSelectQueue = viewModel::selectQueue,
        onSelectOrder = viewModel::selectOrder,
        onOpenOrder = onOpenOrder,
        onCloseOrder = {
            viewModel.clearSelection()
            onCloseOrder()
        },
        onRetry = viewModel::refresh,
        onTransition = viewModel::requestTransition,
        onItemProgress = viewModel::recordProgress,
        onDismissMessage = viewModel::dismissMessage,
    )
}

/**
 * The Orders screen — pure and stateless (state in, callbacks out).
 *
 * **Tablet-first (FR-023).** The shop's primary device is a large tablet in landscape, so at >= 840dp the
 * queue and the pick list are side by side and the operator never loses the queue to open an order. Below
 * that the same content becomes one pane at a time. The split is decided by the width actually available —
 * never by an `isTablet` flag — so a phone in the hand and a tablet on the counter each get the right shape.
 *
 * **No cards** (constitution Principle V): rows, dividers and sections throughout.
 */
@Composable
fun OrdersScreen(
    state: OrdersUiState,
    onSelectQueue: (QueueState) -> Unit,
    onSelectOrder: (String) -> Unit,
    onOpenOrder: (String) -> Unit,
    onCloseOrder: () -> Unit,
    onRetry: () -> Unit,
    onTransition: (FulfillmentTransition) -> Unit,
    onItemProgress: (orderItemId: String, gathered: Int?, unavailable: Int?) -> Unit,
    onDismissMessage: () -> Unit,
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
            .imePadding(),
    ) {
        val wide = maxWidth >= 840.dp
        val showingDetail = state.selectedId != null

        Column(Modifier.fillMaxSize()) {
            OrdersHeader(state = state, onSelectQueue = onSelectQueue, onRefresh = onRetry)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            state.message?.let { MessageBanner(it, onDismissMessage) }

            if (wide) {
                Row(Modifier.fillMaxSize()) {
                    OrdersListPane(
                        state = state,
                        onSelectOrder = onSelectOrder,
                        onRetry = onRetry,
                        modifier = Modifier.width(380.dp).fillMaxHeight(),
                    )
                    Box(
                        Modifier
                            .width(1.dp)
                            .fillMaxHeight()
                            .background(MaterialTheme.colorScheme.outlineVariant),
                    )
                    OrderDetailPane(
                        state = state,
                        showBack = false,
                        onBack = onCloseOrder,
                        onTransition = onTransition,
                        onItemProgress = onItemProgress,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            } else if (showingDetail) {
                OrderDetailPane(
                    state = state,
                    showBack = true,
                    onBack = onCloseOrder,
                    onTransition = onTransition,
                    onItemProgress = onItemProgress,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                // Compact: opening an order PUSHES a nav route, so system back works and the pick survives
                // process death — rather than being an in-place selection the platform knows nothing about.
                OrdersListPane(
                    state = state,
                    onSelectOrder = onOpenOrder,
                    onRetry = onRetry,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

@Composable
private fun OrdersHeader(state: OrdersUiState, onSelectQueue: (QueueState) -> Unit, onRefresh: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.xl, vertical = EffySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                Text(
                    "Orders",
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.semantics { heading() },
                )
                if (state.atRiskCount > 0) {
                    // Escalation is a signal, not a re-ordering — the queue itself never rearranges (FR-001a).
                    Text(
                        "${state.atRiskCount} at risk",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            }
            TextButton(onClick = onRefresh, modifier = Modifier.heightIn(min = 52.dp)) { Text("Refresh") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            QueueState.entries.forEach { queue ->
                QueueChip(label = queue.label, selected = state.queue == queue) { onSelectQueue(queue) }
            }
        }
    }
}

@Composable
private fun OrdersListPane(
    state: OrdersUiState,
    onSelectOrder: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier,
) {
    Column(modifier.background(MaterialTheme.colorScheme.background)) {
        when {
            state.isLoadingQueue && state.orders.isEmpty() -> InfoBlock("Loading orders…")
            state.orders.isEmpty() && state.message != null -> ErrorBlock(state.message, onRetry)
            state.orders.isEmpty() -> InfoBlock(
                if (state.queue == QueueState.ACTIVE) {
                    "No orders waiting. New orders appear here automatically."
                } else {
                    "No completed orders yet."
                },
            )
            else -> Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                state.orders.forEach { order ->
                    OrderQueueRow(
                        order = order,
                        selected = order.id == state.selectedId,
                        onClick = { onSelectOrder(order.id) },
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
}

@Composable
private fun OrderQueueRow(order: FulfillmentSummary, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (selected) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.background)
            .clickable(onClick = onClick)
            // Fat-finger target: a shop tablet is operated with gloves on, at arm's length.
            .heightIn(min = 96.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .width(4.dp)
                .fillMaxHeight()
                .background(
                    when {
                        order.atRisk -> MaterialTheme.colorScheme.error
                        selected -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.background
                    },
                ),
        )
        Column(
            modifier = Modifier.weight(1f).padding(horizontal = EffySpacing.md, vertical = EffySpacing.s),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    order.orderNumber,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (order.atRisk) {
                    Text(
                        "AT RISK",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            Text(
                "${order.itemCount} items · placed ${clockTime(order.placedAt)} · ready by ${clockTime(order.promise.readyBy)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
            )
            if (order.settledCount > 0 && order.status == FulfillmentState.PICKING) {
                Text(
                    "${order.gatheredCount} gathered" + if (order.unavailableCount > 0) " · ${order.unavailableCount} unavailable" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Box(Modifier.padding(end = EffySpacing.md)) { StatePill(order.status) }
    }
}

@Composable
private fun OrderDetailPane(
    state: OrdersUiState,
    showBack: Boolean,
    onBack: () -> Unit,
    onTransition: (FulfillmentTransition) -> Unit,
    onItemProgress: (orderItemId: String, gathered: Int?, unavailable: Int?) -> Unit,
    modifier: Modifier,
) {
    Column(
        modifier = modifier
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(EffySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
    ) {
        if (showBack) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 52.dp)) { Text("← All orders") }
        }
        val detail = state.detail
        when {
            state.isLoadingDetail -> InfoBlock("Opening order…")
            detail != null -> OrderDetailContent(
                detail = detail,
                canPickItems = state.canPickItems,
                isBusy = state.isBusy,
                onTransition = onTransition,
                onItemProgress = onItemProgress,
            )
            // Deliberately NOT auto-selecting the first row: reading a portion acknowledges it (FR-011a), so
            // a portion is only ever opened by a human tap.
            else -> InfoBlock("Select an order to start picking.")
        }
    }
}

@Composable
private fun OrderDetailContent(
    detail: FulfillmentDetail,
    canPickItems: Boolean,
    isBusy: Boolean,
    onTransition: (FulfillmentTransition) -> Unit,
    onItemProgress: (orderItemId: String, gathered: Int?, unavailable: Int?) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), verticalAlignment = Alignment.CenterVertically) {
            StatePill(detail.status)
            Text(
                "in this state since ${clockTime(detail.stateChangedAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            detail.orderNumber,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            "${detail.promise.serviceLevel} · ready by ${clockTime(detail.promise.readyBy)}",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
        )
    }

    DeliverySection(detail.delivery)

    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        Text(
            "PICK LIST — ${detail.gatheredCount}/${detail.itemCount} GATHERED" +
                if (detail.unavailableCount > 0) " · ${detail.unavailableCount} UNAVAILABLE" else "",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        detail.items.forEach { item ->
            PickItemRow(item = item, editable = canPickItems, onItemProgress = onItemProgress)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }

    TransitionActions(detail = detail, isBusy = isBusy, onTransition = onTransition)
}

@Composable
private fun DeliverySection(delivery: DeliveryContext) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        Text(
            "DELIVERY",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        DetailRow("Recipient", delivery.recipientName)
        DetailRow("Address", delivery.addressLines.joinToString(", "))
        delivery.phone?.takeIf { it.isNotBlank() }?.let { DetailRow("Phone", it) }
    }
}

@Composable
private fun PickItemRow(
    item: FulfillmentItem,
    editable: Boolean,
    onItemProgress: (orderItemId: String, gathered: Int?, unavailable: Int?) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = EffySpacing.s),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    item.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (item.isFlagged) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    listOfNotNull(item.sku, "${item.gatheredQuantity} of ${item.orderedQuantity} gathered").joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (item.isFlagged) {
                    Text(
                        "${item.unavailableQuantity} unavailable",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Text(
                "×${item.orderedQuantity}",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }

        if (editable) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Absolute quantities, computed here from what is on screen — the wire never sees a delta.
                QuantityButton(
                    label = "−",
                    enabled = item.gatheredQuantity > 0,
                    onClick = { onItemProgress(item.orderItemId, item.gatheredQuantity - 1, null) },
                )
                QuantityButton(
                    label = "+",
                    enabled = item.outstandingQuantity > 0,
                    onClick = { onItemProgress(item.orderItemId, item.gatheredQuantity + 1, null) },
                )
                Box(Modifier.weight(1f))
                if (item.isFlagged) {
                    // Un-flagging is the SAME call with an absolute zero (FR-010d) — never a special undo path.
                    OutlinedButton(
                        onClick = { onItemProgress(item.orderItemId, null, 0) },
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.heightIn(min = 52.dp),
                    ) { Text("Found it") }
                } else {
                    OutlinedButton(
                        onClick = {
                            onItemProgress(item.orderItemId, null, item.orderedQuantity - item.gatheredQuantity)
                        },
                        enabled = item.outstandingQuantity > 0,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.heightIn(min = 52.dp),
                    ) { Text("Not available") }
                }
            }
        }
    }
}

@Composable
private fun TransitionActions(
    detail: FulfillmentDetail,
    isBusy: Boolean,
    onTransition: (FulfillmentTransition) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        when (detail.status) {
            FulfillmentState.COLLECTED ->
                Text(
                    "Collected — this order has left the shop and can no longer be changed.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            FulfillmentState.READY_FOR_PICKUP -> {
                Text(
                    "Ready for pickup — awaiting collection.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                // The one permitted reversal (FR-011d), and audited exactly like a forward move (FR-011e).
                OutlinedButton(
                    onClick = { onTransition(FulfillmentTransition.PICKING) },
                    enabled = !isBusy,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                ) { Text("Back to picking") }
            }
            else -> {
                val next = detail.nextTransition
                if (next != null) {
                    if (next == FulfillmentTransition.READY_FOR_PICKUP && !detail.isFullySettled) {
                        // A shortfall never blocks completion (FR-010c) — it is stated, not enforced.
                        Text(
                            "Some items are still outstanding. You can still mark this ready.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Button(
                        onClick = { onTransition(next) },
                        enabled = !isBusy,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                    ) {
                        Text(
                            when (next) {
                                FulfillmentTransition.PICKING -> "Start picking"
                                FulfillmentTransition.READY_FOR_PICKUP -> "Mark ready for pickup"
                            },
                        )
                    }
                }
            }
        }
    }
}

// ── atoms ──────────────────────────────────────────────────────────────────────────────────────────

@Composable
private fun QuantityButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
        modifier = Modifier.size(56.dp),
    ) {
        Text(label, style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun QueueChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.background)
            .border(1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, CircleShape)
            .clickable(onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
        style = MaterialTheme.typography.labelLarge,
        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun StatePill(status: FulfillmentState) {
    val background = when (status) {
        FulfillmentState.PENDING -> MaterialTheme.colorScheme.error
        FulfillmentState.PICKING, FulfillmentState.READY_FOR_PICKUP -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val foreground = when (status) {
        FulfillmentState.PENDING -> MaterialTheme.colorScheme.onError
        FulfillmentState.PICKING, FulfillmentState.READY_FOR_PICKUP -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Text(
        status.label.uppercase(),
        modifier = Modifier
            .clip(CircleShape)
            .background(background)
            .padding(horizontal = EffySpacing.s, vertical = 3.dp),
        style = MaterialTheme.typography.labelSmall,
        color = foreground,
    )
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = EffySpacing.md),
        )
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
private fun MessageBanner(message: String, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = EffySpacing.xl, vertical = EffySpacing.s),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
        )
        TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text("Dismiss") }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
private fun InfoBlock(message: String) {
    Box(Modifier.fillMaxWidth().heightIn(min = 160.dp), contentAlignment = Alignment.Center) {
        Text(message, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ErrorBlock(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(EffySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Text(message, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = onRetry, shape = RoundedCornerShape(8.dp), modifier = Modifier.heightIn(min = 52.dp)) {
            Text("Retry")
        }
    }
}

/**
 * ISO-8601 → wall-clock "HH:MM" for the shop floor. Deliberately a string slice: the backend is authoritative
 * on time, the shop only ever reads it, and this app carries no date-time dependency to reformat it with.
 */
private fun clockTime(iso: String): String =
    iso.substringAfter('T', "").takeIf { it.length >= 5 }?.take(5) ?: iso
