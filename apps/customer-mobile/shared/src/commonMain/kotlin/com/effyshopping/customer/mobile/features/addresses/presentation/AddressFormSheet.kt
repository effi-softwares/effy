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
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffyButtonShape
import com.effyshopping.mobile.design.EffySpacing
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton

/**
 * The shared add/edit address form (022), rendered inside a `ModalBottomSheet`. Extracted from the
 * Address Book screen so Checkout (023) raises the SAME form when adding an address mid-purchase
 * (Principle II). Label chips (Home/Work/Other) + the required/optional fields; validation errors are
 * driven by the caller's ViewModel (the form state never lives in Compose `remember`).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressFormSheet(
    form: AddressForm,
    fieldErrors: Map<String, String>,
    onChange: (AddressForm) -> Unit,
) {
    // ⚠ The scroll container, IME padding, navigation-bar padding and the title now belong to
    // EffySheet (034 T017). Re-adding them here would double the insets and nest a scroll inside a
    // scroll.
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {

        // Label chips (FR-006a): Home / Work / Other — Other reveals a free-text field.
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
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

        // ⚠ 034 — NO ACTION ROW HERE. `EffySheet` owns the Save/Cancel pair so every account sheet is
        // identical: primary full-width, Cancel de-weighted beneath it. This form used to draw its own
        // side-by-side pair (with a raw Material button), which is why it looked like a different
        // component from the single-field editors.
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
    // 026: the shared [EffyField] — a label ABOVE a plain bordered box, and the error rendered as
    // helper text beneath rather than only as a red outline (colour is never the only signal, FR-040).
    EffyField(
        label = label,
        value = value,
        onValueChange = onChange,
        error = error,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
    )
}
