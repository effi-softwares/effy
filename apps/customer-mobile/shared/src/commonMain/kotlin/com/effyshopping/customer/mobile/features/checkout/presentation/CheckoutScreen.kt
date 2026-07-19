package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.checkout.domain.Address
import com.effyshopping.customer.mobile.features.checkout.domain.NewAddress

/**
 * Checkout (019 US3). Reached only when signed in (the shell gates guests). Select/add a delivery
 * address and pay; the native PaymentSheet is presented by the [PaymentDriver] behind [PayForOrder].
 * On success [onPlaced] navigates to the receipt.
 */
@Composable
fun CheckoutScreen(container: AppContainer, onPlaced: (String) -> Unit, onBack: () -> Unit) {
    val vm = viewModel {
        CheckoutViewModel(
            guestCart = container.guestCart,
            cartRepo = container.cartRepository,
            listAddresses = container.listAddresses,
            createAddress = container.createAddress,
            pay = container.payForOrder,
        )
    }
    val state by vm.state.collectAsState()

    LaunchedEffect(state) {
        (state as? CheckoutUiState.Placed)?.let { onPlaced(it.orderId) }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TextButton(onClick = onBack, modifier = Modifier.padding(4.dp)) { Text("← Back") }
        Text("Checkout", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(horizontal = 16.dp))

        when (val s = state) {
            CheckoutUiState.Loading, is CheckoutUiState.Placed ->
                Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(Modifier.padding(32.dp)) }

            is CheckoutUiState.Ready -> AddressAndPay(s, vm)
        }
    }
}

@Composable
private fun AddressAndPay(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Delivery address", style = MaterialTheme.typography.titleMedium)
        s.addresses.forEach { addr -> AddressRow(addr, selected = addr.id == s.selectedId, onSelect = { vm.select(addr.id) }) }

        AddAddressForm(onAdd = vm::addAddress)

        s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }

        Button(
            onClick = vm::payNow,
            enabled = !s.paying && s.selectedId != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (s.paying) "Processing…" else "Pay now")
        }
    }
}

@Composable
private fun AddressRow(addr: Address, selected: Boolean, onSelect: () -> Unit) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier.fillMaxWidth().selectable(selected = selected, onClick = onSelect).padding(vertical = 6.dp),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(selected = selected, onClick = onSelect)
        Column {
            Text(addr.recipientName, style = MaterialTheme.typography.bodyMedium)
            Text(
                "${addr.line1}, ${addr.city} ${addr.postalCode}, ${addr.country}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun AddAddressForm(onAdd: (NewAddress) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var line1 by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var postal by remember { mutableStateOf("") }

    if (!open) {
        TextButton(onClick = { open = true }) { Text("+ Add a delivery address") }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(name, { name = it }, label = { Text("Recipient name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(line1, { line1 = it }, label = { Text("Address line 1") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(city, { city = it }, label = { Text("City") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(postal, { postal = it }, label = { Text("Postal code") }, modifier = Modifier.fillMaxWidth())
        Button(
            onClick = { onAdd(NewAddress(name, line1, null, city, null, postal)) },
            enabled = name.isNotBlank() && line1.isNotBlank() && city.isNotBlank() && postal.isNotBlank(),
        ) { Text("Save address") }
    }
}
