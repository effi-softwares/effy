package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.input.nestedscroll.nestedScroll
import com.effyshopping.customer.mobile.resources.lucide_package
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryWindowText
import com.effyshopping.customer.mobile.features.checkout.domain.OrderStage
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.EffyStatusKind
import com.effyshopping.customer.mobile.core.presentation.EffyStatusPill
import com.effyshopping.customer.mobile.core.presentation.EffyCard
import com.effyshopping.customer.mobile.core.presentation.EffySnackbarHost
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffyLoading
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonText
import com.effyshopping.customer.mobile.core.presentation.rememberEffyCollapse
import com.effyshopping.customer.mobile.core.presentation.EffyScreenHeader
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.TextButton
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.live.LiveKind
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.mobile.kit.ui.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffySegmentedToggle
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.customer.mobile.features.checkout.domain.ListOrders
import com.effyshopping.customer.mobile.features.checkout.domain.OrderSummary
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType

private sealed interface OrdersUiState {
    data object Loading : OrdersUiState
    data class Ready(val orders: List<OrderSummary>) : OrdersUiState
    data object Error : OrdersUiState
}

private class OrdersViewModel(
    private val listOrders: ListOrders,
    /** "your orders changed, or the channel just (re)connected: read now". */
    private val liveChanges: Flow<Unit>,
) : ViewModel() {
    private val _state = MutableStateFlow<OrdersUiState>(OrdersUiState.Loading)
    val state: StateFlow<OrdersUiState> = _state.asStateFlow()

    init {
        load()
        // The same quiet re-read a pull-to-refresh does: what is on screen stays on screen.
        viewModelScope.launch { liveChanges.collect { refresh() } }
    }

    /** Extracted from `init` so the error state can offer a retry. */
    /**
     * Reload without clearing the screen — what a pull-to-refresh needs.
     *
     * [load] flips the state to Loading first, which replaces the whole screen with a spinner. That is
     * right on first open and wrong on a refresh: the shopper is looking at this content and asking for a
     * newer version of it, not asking for it to disappear. A failure here keeps what is on screen for the
     * same reason — "we could not check" must never read as "there is nothing here".
     */
    suspend fun refresh() {
        try {
            _state.value = OrdersUiState.Ready(listOrders())
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            // Keep what is on screen.
        }
    }

    fun load() {
        _state.value = OrdersUiState.Loading
        viewModelScope.launch {
            try {
                _state.value = OrdersUiState.Ready(listOrders())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = OrdersUiState.Error
            }
        }
    }
}

/** Order history. Most-recent-first; tap a row to open its receipt. Signed-in only. */
@Composable
fun OrdersScreen(
    container: AppContainer,
    onOpen: (String) -> Unit,
    /** An empty order list offers a route back into the catalogue. */
    onBrowse: () -> Unit = {},
    /** 087 (Orders board) — the reorder snackbar's "View cart". */
    onViewCart: () -> Unit = {},
) {
    val vm = viewModel { OrdersViewModel(container.listOrders, container.live.changes(LiveKind.ORDERS)) }
    val state by vm.state.collectAsState()
    val scope = rememberCoroutineScope()
    val snackbarHost = remember { SnackbarHostState() }

    /**
     * Put a past order back in the cart, and tell the shopper what could not come.
     *
     * The report is the point. Silently adding a subset is the one outcome they cannot detect for
     * themselves — they would go to the cart believing they had reordered. It names no shop, only counts.
     */
    fun reorder(orderId: String) {
        scope.launch {
            val outcome = container.reorderPastOrder(orderId)
            val message = when {
                outcome == null -> "We couldn’t reorder that just now."
                outcome.cart.lines.isEmpty() && outcome.skipped.isNotEmpty() ->
                    "Nothing from that order is available right now."
                outcome.skipped.isEmpty() -> "Added to your cart."
                else -> {
                    val n = outcome.skipped.size
                    "Added to your cart. $n item${if (n == 1) "" else "s"} couldn’t be added."
                }
            }
            val added = outcome != null && outcome.cart.lines.isNotEmpty()
            val result = snackbarHost.showSnackbar(message, actionLabel = if (added) "View cart" else null)
            if (result == androidx.compose.material3.SnackbarResult.ActionPerformed) onViewCart()
        }
    }

    // The source design's Ongoing / Completed segmented toggle. "Ongoing" is everything that has
    // not reached a terminal state; "Completed" is what has. The split is derived from the order's own
    // status, so no new server capability is needed.
    var tab by remember { mutableStateOf(OrdersTab.Ongoing) }

    val collapse = rememberEffyCollapse()
    Box(Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize()) {
        EffyScreenHeader(title = "Orders", collapse = collapse)
        EffySegmentedToggle(
            options = OrdersTab.entries,
            selected = tab,
            label = { it.label },
            onSelect = { tab = it },
            modifier = Modifier.padding(horizontal = EffySpacing.lg),
        )

        when (val s = state) {
            OrdersUiState.Loading -> OrdersSkeleton()

            OrdersUiState.Error -> EffyErrorState(
                title = "We couldn’t load your orders",
                body = "Please try again in a moment.",
                onRetry = vm::load,
            )

            is OrdersUiState.Ready -> {
                val shown = s.orders.filter { isOngoing(it.status) == (tab == OrdersTab.Ongoing) }
                if (shown.isEmpty()) {
                    // An empty order list offers a route back into the catalogue.
                    EffyEmptyState(
                        title = if (tab == OrdersTab.Ongoing) "No orders in progress" else "No completed orders",
                        icon = Res.drawable.lucide_package,
                        body = if (tab == OrdersTab.Ongoing) {
                            "You don’t have any orders in progress right now."
                        } else {
                            "Orders you’ve received will appear here."
                        },
                        actionLabel = "Start shopping",
                        onAction = onBrowse,
                    )
                } else {
                    EffyPullToRefresh(onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                        LazyColumn(
                            Modifier.fillMaxSize().nestedScroll(collapse.connection),
                            contentPadding = PaddingValues(EffySpacing.lg),
                            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
                        ) {
                            items(shown, key = { it.id }) { order ->
                                OrderRow(order, onOpen, ::reorder, Modifier.animateItem())
                            }
                        }
                    }
                }
            }
        }
    }
    // The reorder outcome is announced here — at the bottom, above the tab bar (Patterns board).
    EffySnackbarHost(snackbarHost, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

/** The list before it reads: the same padded column of order cards, each laid out as [OrderRow] lays it out. */
@Composable
private fun OrdersSkeleton() {
    val type = MaterialTheme.typography
    EffyLoading(Modifier.fillMaxSize(), label = "Loading your orders") {
        Column(Modifier.fillMaxSize().padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
            repeat(3) { i ->
                EffyCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        EffySkeletonText(type.titleSmall, Modifier.weight(1f), widthFraction = 0.4f)
                        EffySkeletonBlock(Modifier.width(72.dp).height(24.dp), radius = 12.dp)
                    }
                    EffySkeletonText(type.bodyLarge, Modifier.padding(top = EffySpacing.xs).fillMaxWidth(), widthFraction = if (i % 2 == 0) 0.7f else 0.55f)
                    EffySkeletonText(type.bodySmall, Modifier.fillMaxWidth(), widthFraction = 0.45f)
                    Row(Modifier.padding(top = EffySpacing.md), horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                        repeat(3) { EffySkeletonBlock(Modifier.size(44.dp)) }
                    }
                    HorizontalDivider(Modifier.padding(vertical = EffySpacing.md), color = MaterialTheme.colorScheme.outlineVariant)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        EffySkeletonText(type.bodyMedium, Modifier.weight(1f), widthFraction = 0.4f)
                        EffySkeletonText(type.labelLarge, Modifier.width(140.dp))
                    }
                }
            }
        }
    }
}

/** The source's two order tabs. */
private enum class OrdersTab(val label: String) { Ongoing("Ongoing"), Completed("Completed") }

/**
 * Is this order still in progress from the customer's point of view?
 *
 * Deliberately conservative: anything not known to be finished counts as ongoing, so a status this
 * app has not seen before shows up under "Ongoing" rather than silently vanishing from both tabs.
 */
private fun isOngoing(status: String): Boolean = status !in setOf("delivered", "cancelled", "refunded")

/**
 * One order: number and stage pill, the arrival it was sold, up to four pictures with "+N", items and total,
 * and "Buy again". The arrival is said only through the receipt's wording ([arrivalLabel] over
 * `DeliveryWindowText`, `DeliveryTypeWords.courierLines` for a courier); with no promise, no arrival line.
 */
@Composable
private fun OrderRow(order: OrderSummary, onOpen: (String) -> Unit, onReorder: (String) -> Unit, modifier: Modifier = Modifier) {
    EffyCard(modifier = modifier, onClick = { onOpen(order.id) }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(order.orderNumber, style = MaterialTheme.typography.titleSmall.copy(fontFeatureSettings = "tnum"), modifier = Modifier.weight(1f))
            val (word, kind) = orderStageWord(order)
            EffyStatusPill(word, kind)
        }
        orderArrivalLine(order)?.let {
            Text(it, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = EffySpacing.xs))
        }
        Text(
            listOfNotNull(
                order.placedAt?.let { placed -> DeliveryWindowText.epochMillisOrNull(placed)?.let { "Placed ${DeliveryWindowText.formatDay(DeliveryWindowText.melbourneDay(it))}" } },
                // Who delivers it, in the same two names as everywhere else.
                if (order.delivery.type == DeliveryType.COURIER) DeliveryTypeWords.COURIER else DeliveryTypeWords.EFFY,
            ).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (order.thumbnails.isNotEmpty()) {
            Row(modifier = Modifier.padding(top = EffySpacing.md), horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                order.thumbnails.take(4).forEach { url ->
                    Box(Modifier.size(44.dp).clip(EffyStorefrontShape.card).background(EffySurface.tint)) {
                        ProductImage(url, "", modifier = Modifier.fillMaxSize())
                    }
                }
                val more = order.itemCount - order.thumbnails.take(4).size
                if (more > 0) {
                    Box(Modifier.size(44.dp).clip(EffyStorefrontShape.card).background(EffySurface.tint), contentAlignment = Alignment.Center) {
                        Text("+$more", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
        HorizontalDivider(Modifier.padding(vertical = EffySpacing.md), color = MaterialTheme.colorScheme.outlineVariant)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "${order.itemCount} item${if (order.itemCount == 1) "" else "s"} · ${orderMoney(order.grandTotalAmount, order.currency)}",
                style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"),
                modifier = Modifier.weight(1f),
            )
            // "buy again" — re-finding fifteen items is work nobody does.
            EffyTextLink("Buy again", onClick = { onReorder(order.id) })
            // 087 (Orders board) — "Track order" while it is on its way, else "View order". The card
            // opens it too; this names what the tap is for. The stage is the server's.
            EffyTextLink(
                if (order.stage == OrderStage.OnTheWay) "Track order" else "View order",
                onClick = { onOpen(order.id) },
                modifier = Modifier.padding(start = EffySpacing.md),
            )
        }
    }
}

/** The stage pill: the server's stage when the list carries it, else the payment status. */
internal fun orderStageWord(order: OrderSummary): Pair<String, EffyStatusKind> = when {
    order.fullyRefunded -> "Refunded" to EffyStatusKind.Inert
    order.status == "cancelled" -> "Cancelled" to EffyStatusKind.Inert
    order.status == "failed" -> "Payment failed" to EffyStatusKind.Problem
    order.status == "pending_payment" -> "Awaiting payment" to EffyStatusKind.Problem
    order.stage == OrderStage.Delivered -> "Delivered" to EffyStatusKind.Done
    order.stage == OrderStage.OnTheWay -> "On the way" to EffyStatusKind.InProgress
    order.stage == OrderStage.Packing -> "Being packed" to EffyStatusKind.InProgress
    order.stage == OrderStage.Confirmed -> "Confirmed" to EffyStatusKind.InProgress
    else -> statusLabel(order.status) to EffyStatusKind.InProgress
}

/** The arrival line — only ever as sold, only through the pinned wording. */
internal fun orderArrivalLine(order: OrderSummary): String? {
    order.deliveredAt?.let { at -> DeliveryWindowText.epochMillisOrNull(at)?.let { return "Delivered ${DeliveryWindowText.formatDay(DeliveryWindowText.melbourneDay(it))}" } }
    if (order.status in setOf("cancelled", "refunded") || order.fullyRefunded) return null
    val delivery = order.delivery
    if (delivery.type == DeliveryType.COURIER) {
        return delivery.courierEstimate?.let { DeliveryTypeWords.courierEstimateSentence(it) }
    }
    val arrival = order.arrivals.firstOrNull() ?: return null
    return arrivalLabel(arrival)
}

private fun statusLabel(status: String) = when (status) {
    "paid" -> "Paid"
    "pending_payment" -> "Awaiting payment"
    "failed" -> "Payment failed"
    else -> status
}

private fun orderMoney(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"
