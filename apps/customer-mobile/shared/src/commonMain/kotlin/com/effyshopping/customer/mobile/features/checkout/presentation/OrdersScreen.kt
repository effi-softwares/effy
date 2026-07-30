package com.effyshopping.customer.mobile.features.checkout.presentation

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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffySegmentedToggle
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.customer.mobile.features.checkout.domain.ListOrders
import com.effyshopping.customer.mobile.features.checkout.domain.OrderSummary
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private sealed interface OrdersUiState {
    data object Loading : OrdersUiState
    data class Ready(val orders: List<OrderSummary>) : OrdersUiState
    data object Error : OrdersUiState
}

private class OrdersViewModel(private val listOrders: ListOrders) : ViewModel() {
    private val _state = MutableStateFlow<OrdersUiState>(OrdersUiState.Loading)
    val state: StateFlow<OrdersUiState> = _state.asStateFlow()

    init {
        load()
    }

    /** 026: extracted from `init` so the error state can offer a retry (FR-021). */
    /**
     * Reload WITHOUT clearing the screen — what a pull-to-refresh needs.
     *
     * ⚠ [load] flips the state to Loading first, which replaces the whole screen with a spinner. That is
     * right on first open and wrong on a refresh: the shopper is LOOKING at this content and asking for a
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

/** Order history (019 US5). Most-recent-first; tap a row to open its receipt. Signed-in only. */
@Composable
fun OrdersScreen(
    container: AppContainer,
    onOpen: (String) -> Unit,
    /** FR-044: an empty order list offers a route back into the catalogue. */
    onBrowse: () -> Unit = {},
) {
    val vm = viewModel { OrdersViewModel(container.listOrders) }
    val state by vm.state.collectAsState()

    // 026: the source design's Ongoing / Completed segmented toggle. "Ongoing" is everything that has
    // not reached a terminal state; "Completed" is what has. The split is derived from the order's own
    // status, so no new server capability is needed (FR-002).
    var tab by remember { mutableStateOf(OrdersTab.Ongoing) }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "My Orders")
        EffySegmentedToggle(
            options = OrdersTab.entries,
            selected = tab,
            label = { it.label },
            onSelect = { tab = it },
            modifier = Modifier.padding(horizontal = EffySpacing.lg),
        )

        when (val s = state) {
            OrdersUiState.Loading ->
                Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(Modifier.padding(32.dp))
                }

            OrdersUiState.Error -> EffyEmptyState(
                title = "We couldn’t load your orders",
                body = "Please try again in a moment.",
                actionLabel = "Try again",
                onAction = vm::load,
            )

            is OrdersUiState.Ready -> {
                val shown = s.orders.filter { isOngoing(it.status) == (tab == OrdersTab.Ongoing) }
                if (shown.isEmpty()) {
                    // FR-044: an empty order list offers a route back into the catalogue.
                    EffyEmptyState(
                        title = if (tab == OrdersTab.Ongoing) "No Ongoing Orders!" else "No Completed Orders!",
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
                        LazyColumn(Modifier.fillMaxSize()) {
                            items(shown, key = { it.id }) { order ->
                                OrderRow(order, onOpen)
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }
    }
}

/** The source's two order tabs. */
private enum class OrdersTab(val label: String) { Ongoing("Ongoing"), Completed("Completed") }

/**
 * Is this order still in progress from the CUSTOMER's point of view?
 *
 * ⚠ Deliberately conservative: anything not known to be finished counts as ongoing, so a status this
 * app has not seen before shows up under "Ongoing" rather than silently vanishing from both tabs.
 */
private fun isOngoing(status: String): Boolean = status !in setOf("delivered", "cancelled", "refunded")

@Composable
private fun OrderRow(order: OrderSummary, onOpen: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onOpen(order.id) }.padding(EffySpacing.lg),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(order.orderNumber, style = MaterialTheme.typography.bodyMedium)
            Text(
                "${order.itemCount} item${if (order.itemCount == 1) "" else "s"} · ${statusLabel(order.status)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(orderMoney(order.grandTotalAmount, order.currency), style = MaterialTheme.typography.bodyMedium)
    }
}

private fun statusLabel(status: String) = when (status) {
    "paid" -> "Paid"
    "pending_payment" -> "Awaiting payment"
    "failed" -> "Payment failed"
    else -> status
}

private fun orderMoney(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"
