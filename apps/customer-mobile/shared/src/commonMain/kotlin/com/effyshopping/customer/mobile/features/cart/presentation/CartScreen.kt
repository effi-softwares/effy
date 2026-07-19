package com.effyshopping.customer.mobile.features.cart.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.computeTotals

/**
 * The cart (019 US3). ONE unified Effy cart — a single list + single total, NO shop identity (FR-016).
 * Reads the device-local guest cart; qty edit/remove; Checkout gates a guest through sign-in in the shell.
 */
@Composable
fun CartScreen(container: AppContainer, onCheckout: () -> Unit) {
    val lines by container.guestCart.lines.collectAsState()

    if (lines.isEmpty()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Your cart is empty", style = MaterialTheme.typography.titleMedium)
            Text(
                "Browse the store and add something you like.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    val totals = computeTotals(lines)
    val currency = lines.first().currency

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp)) {
            items(lines, key = { it.productId }) { line ->
                CartRow(line, container)
                HorizontalDivider()
            }
        }
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SummaryRow("Items", money(totals.itemSubtotal, currency))
            SummaryRow("Delivery", money(totals.deliveryFee, currency))
            SummaryRow("Total", money(totals.grandTotal, currency), bold = true)
            Button(onClick = onCheckout, modifier = Modifier.fillMaxWidth()) { Text("Checkout") }
            Text(
                "You’ll sign in at checkout. Your cart is kept.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CartRow(line: GuestCartLine, container: AppContainer) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(line.name, style = MaterialTheme.typography.bodyMedium)
            Text(
                money(line.unitPriceAmount, line.currency) + " each",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { container.guestCart.setQuantity(line.productId, line.quantity - 1) }) { Text("−") }
                Text("${line.quantity}", style = MaterialTheme.typography.bodyMedium)
                TextButton(
                    onClick = { container.guestCart.setQuantity(line.productId, line.quantity + 1) },
                    enabled = line.quantity < 99,
                ) { Text("+") }
                TextButton(onClick = { container.guestCart.remove(line.productId) }) { Text("Remove") }
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String, bold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            label,
            style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            color = if (bold) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(value, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium)
    }
}

private fun money(amount: String, currency: String): String =
    if (currency == "AUD") "$$amount" else "$currency $amount"
