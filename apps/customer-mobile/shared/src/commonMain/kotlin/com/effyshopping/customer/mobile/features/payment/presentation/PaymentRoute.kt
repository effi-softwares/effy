package com.effyshopping.customer.mobile.features.payment.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton

/**
 * The payment destination (051 US1) — resolves the handed-off intent and builds the screen's ViewModel.
 *
 * ⚠ THE INTENT COMES FROM MEMORY, NOT FROM THE ROUTE. `CustomerNavKey.Payment` deliberately carries no
 * arguments: routes are serialized and persisted, and this one would otherwise be persisting a payment
 * client secret. See `PaymentHandoff`.
 */
@Composable
fun PaymentRoute(
    container: AppContainer,
    onPaid: (String) -> Unit,
    onBackToCheckout: () -> Unit,
) {
    val intent = container.paymentHandoff.pending
    if (intent == null) {
        PaymentSessionLost(onBackToCheckout)
        return
    }
    // ⚠ Keyed by ORDER. `viewModel {}` without a key resolves one instance per type per store owner, and
    // the store owner here outlives the screen — so a second order would be paid through the FIRST
    // order's ViewModel, holding the first order's intent. That is a shopper charged for the wrong thing,
    // not a glitch.
    val vm = viewModel(key = intent.orderId) { container.paymentViewModel(intent) }
    PaymentScreen(viewModel = vm, onPaid = onPaid)
}

/**
 * The process was killed while paying, so the intent that lived in memory is gone.
 *
 * ⚠ Nothing has been charged and the order still exists, unpaid — which is exactly what this says. The
 * alternative, rendering the payment screen with no intent, would show a pay button that cannot charge
 * anything and fail at the last possible moment instead of the first.
 */
@Composable
private fun PaymentSessionLost(onBackToCheckout: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Payment")
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Your payment session expired",
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "Nothing has been charged. Go back to checkout to pay for your order.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            EffyPrimaryButton(
                label = "Back to checkout",
                onClick = onBackToCheckout,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
