package com.effyshopping.customer.mobile.features.addresses.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress

/**
 * The address book (022). A LazyColumn of addresses (never cards — Principle V), the default clearly
 * marked, an empty state, and a FAB that raises the add form in a ModalBottomSheet. The row BODY opens
 * edit (a large forgiving target); "Set default" and "Delete" are distinct per-row controls (FR-017a).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressBookScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = viewModel {
        AddressBookViewModel(
            container.listSavedAddresses, container.addSavedAddress, container.updateSavedAddress,
            container.setDefaultAddress, container.deleteSavedAddress,
        )
    }
    val state by vm.state.collectAsState()

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { vm.openAdd() }) {
                Text("+", style = MaterialTheme.typography.headlineSmall)
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Your addresses", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 4.dp))
                TextButton(onClick = onBack) { Text("Back") }
            }
            when {
                state.loading ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

                state.addresses.isEmpty() ->
                    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("No saved addresses yet", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Add a delivery address and it’ll be ready at checkout.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Button(onClick = { vm.openAdd() }, modifier = Modifier.padding(top = 16.dp)) { Text("Add an address") }
                    }

                else ->
                    LazyColumn(Modifier.fillMaxSize()) {
                        state.error?.let { err ->
                            item {
                                Text(err, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
                            }
                        }
                        items(state.addresses, key = { it.id }) { address ->
                            AddressRow(
                                address = address,
                                onEdit = { vm.openEdit(address.id) },
                                onSetDefault = { vm.makeDefault(address.id) },
                                onDelete = { vm.askDelete(address.id) },
                            )
                            HorizontalDivider()
                        }
                    }
            }
        }
    }

    // Add / edit form.
    state.sheet?.let { sheet ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { vm.dismissSheet() }, sheetState = sheetState) {
            AddressFormSheet(
                editing = sheet.editingId != null,
                form = sheet.form,
                fieldErrors = sheet.fieldErrors,
                saving = sheet.saving,
                onChange = vm::onFormChange,
                onSubmit = vm::submit,
                onCancel = vm::dismissSheet,
            )
        }
    }

    // Confirm delete.
    state.pendingDeleteId?.let {
        AlertDialog(
            onDismissRequest = { vm.cancelDelete() },
            title = { Text("Delete this address?") },
            text = { Text("This won’t affect any past orders.") },
            confirmButton = { TextButton(onClick = { vm.confirmDelete() }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { vm.cancelDelete() }) { Text("Cancel") } },
        )
    }

    // Delete-default blocked (server 409): prompt to reassign first (FR-016a).
    if (state.reassignPrompt) {
        AlertDialog(
            onDismissRequest = { vm.dismissReassignPrompt() },
            title = { Text("Set another default first") },
            text = { Text("This is your default delivery address. Make another address the default, then delete this one.") },
            confirmButton = { TextButton(onClick = { vm.dismissReassignPrompt() }) { Text("Got it") } },
        )
    }
}

@Composable
private fun AddressRow(
    address: SavedAddress,
    onEdit: () -> Unit,
    onSetDefault: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        // The row BODY is the edit affordance (FR-017a) — a big touch target.
        Column(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onEdit).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                address.label?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                }
                if (address.isDefault) DefaultBadge()
            }
            Text(address.recipientName, style = MaterialTheme.typography.bodyMedium)
            Text(address.formatLines(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            address.phone?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // Distinct per-row controls — NOT part of the edit target (FR-017a).
        Row(
            Modifier.fillMaxWidth().padding(start = 8.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (!address.isDefault) TextButton(onClick = onSetDefault) { Text("Set default") }
            TextButton(onClick = onDelete) { Text("Delete") }
        }
    }
}

@Composable
private fun DefaultBadge() {
    Surface(color = MaterialTheme.colorScheme.primary, shape = MaterialTheme.shapes.small) {
        Text(
            "Default",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimary,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

private fun SavedAddress.formatLines(): String = buildString {
    append(line1)
    line2?.takeIf { it.isNotBlank() }?.let { append(", ").append(it) }
    append(", ").append(city)
    region?.takeIf { it.isNotBlank() }?.let { append(" ").append(it) }
    append(" ").append(postalCode)
}
