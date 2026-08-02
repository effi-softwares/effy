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
import androidx.compose.runtime.rememberCoroutineScope
import com.effyshopping.customer.mobile.features.saved.presentation.SaveControl
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.money
import com.effyshopping.customer.mobile.features.checkout.domain.GetReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.Receipt
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.EffyPrimaryAction
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

    /**
     * Re-read the receipt WITHOUT clearing the screen.
     *
     * ⚠ Worth having on this screen in particular: a receipt carries the order's fulfilment progress, which
     * changes while the shopper is looking at it — a shop receives it, picks it, marks it ready. It is also
     * the natural place to retry from when the receipt was still `Pending` (the webhook had not landed yet).
     */
    suspend fun refresh() {
        try {
            _state.value = ReceiptUiState.Ready(getReceipt(orderId))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            // Keep what is on screen — including a Pending state, which is itself informative.
        }
    }
}

/**
 * The receipt (019 US3). Reads the WEBHOOK-AUTHORITATIVE order (R4) — ONE Effy order itemized by
 * product, NO shop identity (FR-029). A read failure/lag shows a "confirming" state.
 *
 * ── ⚠ This screen serves TWO destinations, and they are not the same screen ──────────────────────
 *
 * As `Receipt` it is the end of checkout: the stack was REPLACED to get here, so there is nothing
 * behind it, no back arrow, and the only way on is the action at the bottom.
 *
 * As `OrderDetail` it is opened from order history: it sits on top of the Orders tab, so it gets a
 * back arrow (supplied by the navigator — see `LocalNavBack`) and [onDone] is null, because a second
 * button that does exactly what the arrow does is noise.
 *
 * It previously rendered NEITHER an app bar nor a title in either role, so opening a past order gave
 * a shopper a bare wall of numbers with no heading and — since the tab bar hides above a tab root —
 * no visible way back at all.
 */
@Composable
fun ReceiptScreen(
    container: AppContainer,
    orderId: String,
    title: String,
    doneLabel: String? = null,
    onDone: (() -> Unit)? = null,
) {
    val vm = viewModel(key = orderId) { ReceiptViewModel(orderId, container.getReceipt) }
    val state by vm.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = title)
        EffyPullToRefresh(onRefresh = vm::refresh, modifier = Modifier.weight(1f).fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
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
                    if (onDone != null) EffyPrimaryAction(doneLabel ?: "Done", onClick = onDone)
                }
                is ReceiptUiState.Ready -> ReceiptBody(container, s.receipt, doneLabel, onDone)
            }
        }
        }
    }
}

@Composable
private fun ReceiptBody(
    container: AppContainer,
    receipt: Receipt,
    doneLabel: String?,
    onDone: (() -> Unit)?,
) {
    val savedIds by container.savedStore.saved.collectAsState()
    val scope = rememberCoroutineScope()
    Text(if (receipt.paid) "Payment received" else "Order received", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    Text("Thank you", style = MaterialTheme.typography.headlineSmall)
    Text("Order ${receipt.orderNumber}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

    HorizontalDivider(Modifier.padding(vertical = 8.dp))

    receipt.items.forEach { item ->
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            Text("${'$'}{item.productName} × ${'$'}{item.quantity}", style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(money(item.lineSubtotalAmount, receipt.currency), style = MaterialTheme.typography.bodyMedium)
                // 033 FR-008: save from a past order — one of the places people most reliably want to
                // keep something, and the predecessor had no control here at all.
                //
                // ⚠ The product may have been archived or deleted since this order was placed. The
                // LINE still renders from the order's own snapshot, so the save can 404 — runCatching
                // swallows it and the control simply does not stick, rather than appearing to succeed.
                SaveControl(
                    saved = item.productId in savedIds,
                    onToggle = { wanted ->
                        scope.launch {
                            runCatching { container.toggleSaved(item.productId, wanted) }
                        }
                    },
                )
            }
        }
    }

    HorizontalDivider(Modifier.padding(vertical = 8.dp))
    SummaryRow("Items", money(receipt.itemSubtotalAmount, receipt.currency))
    SummaryRow("Delivery", money(receipt.deliveryFeeAmount, receipt.currency))
    // 027 FR-049: what the code took off, as computed at PAYMENT and stored on the order — so the receipt
    // explains itself even after the code has since changed or been disabled.
    if (receipt.discountAmount != null && receipt.discountAmount != "0.00") {
        SummaryRow(
            receipt.promoCode?.let { "Discount ($it)" } ?: "Discount",
            "−" + money(receipt.discountAmount, receipt.currency),
        )
    }
    SummaryRow("Total paid", money(receipt.grandTotalAmount, receipt.currency), bold = true)

    HorizontalDivider(Modifier.padding(vertical = 8.dp))
    Text("Delivering to", style = MaterialTheme.typography.titleSmall)
    Text(receipt.recipientName, style = MaterialTheme.typography.bodyMedium)
    Text(receipt.addressLine, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

    // Billing (023 US5): shipping in full always; billing in full when divergent, else "same as shipping".
    Text("Billing", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
    if (receipt.billingSameAsShipping) {
        Text("Same as shipping", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        receipt.billingRecipientName?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        receipt.billingAddressLine?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }

    if (onDone != null) {
        EffyPrimaryAction(
            doneLabel ?: "Keep shopping",
            onClick = onDone,
            modifier = Modifier.padding(top = EffySpacing.md),
        )
    }
}

@Composable
private fun SummaryRow(label: String, value: String, bold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium)
    }
}


