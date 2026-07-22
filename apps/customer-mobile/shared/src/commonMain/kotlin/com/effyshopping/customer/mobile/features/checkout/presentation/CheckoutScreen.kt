package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressFormSheet
import com.effyshopping.customer.mobile.features.cart.domain.formatCents
import com.effyshopping.customer.mobile.features.cart.domain.parseCents
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliverySelection
import com.effyshopping.customer.mobile.features.checkout.domain.QuotePackage

/**
 * Checkout (019 US3, extended 021 delivery + 023 shipping/billing). Reached only when signed in.
 * Pre-selects the default saved address as SHIPPING (023 US1), lets the customer switch to another saved
 * address or add a new one inline (US2/US3) → per-package ANONYMOUS delivery options → a "Billing same as
 * shipping" toggle (US4) → pay. On success [onPlaced] navigates to the receipt.
 */
@Composable
fun CheckoutScreen(container: AppContainer, onPlaced: (String) -> Unit, onBack: () -> Unit) {
    val vm = viewModel {
        CheckoutViewModel(
            guestCart = container.guestCart,
            cartRepo = container.cartRepository,
            listAddresses = container.listSavedAddresses,
            addAddress = container.addSavedAddress,
            quoteDelivery = container.quoteDelivery,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddressAndPay(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Delivery address", style = MaterialTheme.typography.titleMedium)
        if (s.addresses.isEmpty()) {
            // No saved address → a prompt that blocks pay (023 US1 scenario 3, FR-007).
            Text(
                "Add a delivery address to continue.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            // Picker: the saved addresses as selectable rows (no cards — FR-022); the selected one shown.
            s.addresses.forEach { addr ->
                AddressPickRow(addr, selected = addr.id == s.selectedId, onSelect = { vm.select(addr.id) })
            }
        }
        TextButton(onClick = { vm.openAddAddress(AddressTarget.SHIPPING) }) { Text("+ Add a new address") }

        s.requoteNotice?.let {
            Text(it, color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodyMedium)
        }

        when {
            s.quoting -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(Modifier.padding(4.dp))
                Text("Working out delivery…", style = MaterialTheme.typography.bodyMedium)
            }

            s.quote != null -> DeliverySection(s, vm)
        }

        BillingSection(s, vm)

        s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }

        val quote = s.quote
        val billingReady = s.billingSameAsShipping || s.billingSelectedId != null
        val payEnabled = !s.paying && quote != null && !s.quoting && s.selectedId != null &&
            !quote.fullyUndeliverable && (!quote.hasSetAside || s.setAsideConfirmed) && billingReady
        Button(onClick = vm::payNow, enabled = payEnabled, modifier = Modifier.fillMaxWidth()) {
            Text(if (s.paying) "Processing…" else "Pay now")
        }
    }

    // The shared add-address form (022) — raised for shipping OR billing (023 US3).
    s.sheet?.let { sheet ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = vm::dismissSheet, sheetState = sheetState) {
            AddressFormSheet(
                editing = false,
                form = sheet.form,
                fieldErrors = sheet.fieldErrors,
                saving = sheet.saving,
                onChange = vm::onSheetFormChange,
                onSubmit = vm::submitAddress,
                onCancel = vm::dismissSheet,
            )
        }
    }
}

/** Billing address (023 US4): "same as shipping" toggle ON by default; OFF reveals the same picker. */
@Composable
private fun BillingSection(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    HorizontalDivider()
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Billing address same as shipping", style = MaterialTheme.typography.titleSmall)
        Switch(checked = s.billingSameAsShipping, onCheckedChange = vm::setBillingSameAsShipping)
    }
    if (!s.billingSameAsShipping) {
        if (s.addresses.isEmpty()) {
            Text(
                "Add a billing address to continue.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            s.addresses.forEach { addr ->
                AddressPickRow(addr, selected = addr.id == s.billingSelectedId, onSelect = { vm.selectBilling(addr.id) })
            }
        }
        TextButton(onClick = { vm.openAddAddress(AddressTarget.BILLING) }) { Text("+ Add a billing address") }
    }
}

@Composable
private fun DeliverySection(s: CheckoutUiState.Ready, vm: CheckoutViewModel) {
    val quote = s.quote ?: return
    val serviceable = quote.serviceablePackages
    val multi = quote.packages.size > 1

    if (serviceable.isNotEmpty()) {
        HorizontalDivider()
        Text("Delivery options", style = MaterialTheme.typography.titleMedium)

        // One preference applied to every package (FR-006a). Offer the union of available methods.
        val available = serviceable.flatMap { it.options.map { o -> o.method } }.toSet()
        if (available.size > 1 && serviceable.size > 1) {
            Text("Apply to all packages", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                available.sortedBy { it.ordinal }.forEach { method ->
                    TextButton(onClick = { vm.setDefaultPreference(method) }) {
                        Text(labelFor(method) + if (s.defaultPreference == method) " ✓" else "")
                    }
                }
            }
        }
    }

    serviceable.forEach { pkg ->
        PackageOptions(pkg, s.selections[pkg.packageKey], multi, onSelect = { vm.overridePackage(pkg.packageKey, it) }, onDate = { vm.setScheduledDate(pkg.packageKey, it) })
    }

    if (quote.fullyUndeliverable) {
        HorizontalDivider()
        Text(
            "We can’t deliver any of these items to that address. Choose a different address to continue.",
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
        )
        return
    }

    // Auto-set-aside + explicit confirm (021 US2 / T050) — names ITEMS, never a shop (FR-004, SC-006).
    if (quote.hasSetAside) {
        HorizontalDivider()
        Text("Set aside — can’t be delivered here", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
        Text(
            "These items can’t be delivered to this address. They won’t be ordered or charged. Change the address to include them.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        quote.undeliverablePackages.flatMap { it.items }.forEach { item ->
            Text("• ${item.name} × ${item.quantity}", style = MaterialTheme.typography.bodySmall)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = s.setAsideConfirmed, onCheckedChange = vm::confirmSetAside)
            Text("Proceed without these items", style = MaterialTheme.typography.bodyMedium)
        }
    }

    // Delivery total = Σ selected fees (display only; the server recomputes the authoritative amount).
    val deliveryCents = serviceable.sumOf { pkg ->
        s.selections[pkg.packageKey]?.let { sel -> pkg.optionFor(sel.method)?.feeAmount?.let(::parseCents) } ?: 0L
    }
    HorizontalDivider()
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Delivery", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("$" + formatCents(deliveryCents), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PackageOptions(
    pkg: QuotePackage,
    selection: DeliverySelection?,
    multi: Boolean,
    onSelect: (DeliveryMethod) -> Unit,
    onDate: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (multi) Text("Package", style = MaterialTheme.typography.titleSmall)
        pkg.items.forEach { item ->
            Text("• ${item.name} × ${item.quantity}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        pkg.options.forEach { option ->
            val chosen = selection?.method == option.method
            Row(
                modifier = Modifier.fillMaxWidth().selectable(selected = chosen, onClick = { onSelect(option.method) }).padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(selected = chosen, onClick = { onSelect(option.method) })
                Column(modifier = Modifier.weight(1f)) {
                    Text(option.serviceLevel, style = MaterialTheme.typography.bodyMedium)
                    option.window?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Text("$" + option.feeAmount, style = MaterialTheme.typography.bodyMedium)
            }
            if (chosen && option.method == DeliveryMethod.SCHEDULED && option.scheduleDates.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    option.scheduleDates.forEach { date ->
                        TextButton(onClick = { onDate(date) }) {
                            Text(date + if (selection.scheduledDate == date) " ✓" else "")
                        }
                    }
                }
            }
        }
    }
}

private fun labelFor(method: DeliveryMethod): String = when (method) {
    DeliveryMethod.SAME_DAY -> "Same-day"
    DeliveryMethod.SCHEDULED -> "Pick a date"
    DeliveryMethod.STANDARD -> "Standard"
}

/** One selectable saved-address row (023) — a list, never a card (FR-022). Reused for shipping + billing. */
@Composable
private fun AddressPickRow(addr: SavedAddress, selected: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().selectable(selected = selected, onClick = onSelect).padding(vertical = 6.dp),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(selected = selected, onClick = onSelect)
        Column {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(addr.recipientName, style = MaterialTheme.typography.bodyMedium)
                addr.label?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                if (addr.isDefault) Text("Default", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                addr.formatSummary(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun SavedAddress.formatSummary(): String = buildString {
    append(line1)
    line2?.takeIf { it.isNotBlank() }?.let { append(", ").append(it) }
    append(", ").append(city).append(" ").append(postalCode)
    append(", ").append(country)
}
