package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
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
import com.effyshopping.customer.mobile.features.checkout.domain.GetReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private sealed interface ReceiptUiState {
    data object Loading : ReceiptUiState
    data class Ready(val receipt: Receipt) : ReceiptUiState
    data object Pending : ReceiptUiState
}

private class ReceiptViewModel(private val orderId: String, private val getReceipt: GetReceipt) : ViewModel() {
    private val _state = MutableStateFlow<ReceiptUiState>(ReceiptUiState.Loading)
    val state: StateFlow<ReceiptUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                _state.value = ReceiptUiState.Ready(getReceipt(orderId))
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = ReceiptUiState.Pending
            }
        }
    }
}

/**
 * The receipt (019 US3). Reads the WEBHOOK-AUTHORITATIVE order (R4) — ONE Effy order itemized by
 * product, NO shop identity (FR-029). A read failure/lag shows a "confirming" state.
 */
@Composable
fun ReceiptScreen(container: AppContainer, orderId: String, onDone: () -> Unit) {
    val vm = viewModel(key = orderId) { ReceiptViewModel(orderId, container.getReceipt) }
    val state by vm.state.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (val s = state) {
            ReceiptUiState.Loading -> CircularProgressIndicator(Modifier.padding(32.dp))
            ReceiptUiState.Pending -> {
                Text("We’re confirming your payment", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Your order will appear in your order history shortly.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = onDone) { Text("Done") }
            }
            is ReceiptUiState.Ready -> ReceiptBody(s.receipt, onDone)
        }
    }
}

@Composable
private fun ReceiptBody(receipt: Receipt, onDone: () -> Unit) {
    Text(if (receipt.paid) "Payment received" else "Order received", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    Text("Thank you", style = MaterialTheme.typography.headlineSmall)
    Text("Order ${receipt.orderNumber}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

    HorizontalDivider(Modifier.padding(vertical = 8.dp))

    receipt.items.forEach { item ->
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${item.productName} × ${item.quantity}", style = MaterialTheme.typography.bodyMedium)
            Text(money(item.lineSubtotalAmount, receipt.currency), style = MaterialTheme.typography.bodyMedium)
        }
    }

    HorizontalDivider(Modifier.padding(vertical = 8.dp))
    SummaryRow("Items", money(receipt.itemSubtotalAmount, receipt.currency))
    SummaryRow("Delivery", money(receipt.deliveryFeeAmount, receipt.currency))
    SummaryRow("Total paid", money(receipt.grandTotalAmount, receipt.currency), bold = true)

    HorizontalDivider(Modifier.padding(vertical = 8.dp))
    Text("Delivering to", style = MaterialTheme.typography.titleSmall)
    Text(receipt.recipientName, style = MaterialTheme.typography.bodyMedium)
    Text(receipt.addressLine, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

    Button(onClick = onDone, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("Keep shopping") }
}

@Composable
private fun SummaryRow(label: String, value: String, bold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium)
    }
}

private fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"
