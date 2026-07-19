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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
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
fun OrdersScreen(container: AppContainer, onOpen: (String) -> Unit) {
    val vm = viewModel { OrdersViewModel(container.listOrders) }
    val state by vm.state.collectAsState()

    when (val s = state) {
        OrdersUiState.Loading ->
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(Modifier.padding(32.dp)) }

        OrdersUiState.Error ->
            Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("We couldn’t load your orders", style = MaterialTheme.typography.bodyMedium)
            }

        is OrdersUiState.Ready ->
            if (s.orders.isEmpty()) {
                Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("You haven’t placed any orders yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(s.orders, key = { it.id }) { order ->
                        OrderRow(order, onOpen)
                        HorizontalDivider()
                    }
                }
            }
    }
}

@Composable
private fun OrderRow(order: OrderSummary, onOpen: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onOpen(order.id) }.padding(16.dp),
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
