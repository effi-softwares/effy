package com.effyshopping.customer.mobile.features.addresses.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

/**
 * The shared add/edit address form (022), rendered inside a `ModalBottomSheet`. Extracted from the
 * Address Book screen so Checkout (023) raises the SAME form when adding an address mid-purchase
 * (Principle II). Label chips (Home/Work/Other) + the required/optional fields; validation errors are
 * driven by the caller's ViewModel (the form state never lives in Compose `remember`).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressFormSheet(
    editing: Boolean,
    form: AddressForm,
    fieldErrors: Map<String, String>,
    saving: Boolean,
    onChange: (AddressForm) -> Unit,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(if (editing) "Edit address" else "Add an address", style = MaterialTheme.typography.headlineSmall)

        // Label chips (FR-006a): Home / Work / Other — Other reveals a free-text field.
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LabelChipToggle("Home", form.labelChip == LabelChip.HOME) { onChange(form.copy(labelChip = LabelChip.HOME)) }
            LabelChipToggle("Work", form.labelChip == LabelChip.WORK) { onChange(form.copy(labelChip = LabelChip.WORK)) }
            LabelChipToggle("Other", form.labelChip == LabelChip.OTHER) { onChange(form.copy(labelChip = LabelChip.OTHER)) }
        }
        if (form.labelChip == LabelChip.OTHER) {
            Field("Label", form.otherLabel, onChange = { onChange(form.copy(otherLabel = it)) })
        }

        Field("Recipient name", form.recipientName, error = fieldErrors["recipientName"], onChange = { onChange(form.copy(recipientName = it)) })
        Field("Phone (optional)", form.phone, keyboard = KeyboardType.Phone, onChange = { onChange(form.copy(phone = it)) })
        Field("Address line 1", form.line1, error = fieldErrors["line1"], onChange = { onChange(form.copy(line1 = it)) })
        Field("Address line 2 (optional)", form.line2, onChange = { onChange(form.copy(line2 = it)) })
        Field("Suburb / city", form.city, error = fieldErrors["city"], onChange = { onChange(form.copy(city = it)) })
        Field("State / region (optional)", form.region, onChange = { onChange(form.copy(region = it)) })
        Field("Postcode", form.postalCode, error = fieldErrors["postalCode"], keyboard = KeyboardType.Number, onChange = { onChange(form.copy(postalCode = it)) })

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TextButton(onClick = onCancel, modifier = Modifier.weight(1f)) { Text("Cancel") }
            Button(onClick = onSubmit, enabled = !saving, modifier = Modifier.weight(1f)) {
                Text(if (editing) "Save" else "Add")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LabelChipToggle(text: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(text) })
}

@Composable
private fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    error: String? = null,
    keyboard: KeyboardType = KeyboardType.Text,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            label = { Text(label) },
            singleLine = true,
            isError = error != null,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
    }
}
