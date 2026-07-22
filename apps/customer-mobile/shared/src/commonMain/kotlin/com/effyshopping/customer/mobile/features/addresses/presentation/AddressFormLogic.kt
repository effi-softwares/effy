package com.effyshopping.customer.mobile.features.addresses.presentation

import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress

/**
 * The add/edit form logic (022), extracted so BOTH the Address Book (022) and Checkout (023) reuse one
 * validation + mapping (Principle II — one source of truth, never copy-pasted per surface). Pure
 * functions over [AddressForm]; no coroutines, no state — the ViewModels own the state.
 */

/** Field-level validation (FR-009). The four required fields; optional fields never block. */
fun AddressForm.validate(): Map<String, String> = buildMap {
    if (recipientName.isBlank()) put("recipientName", "Enter a recipient name.")
    if (line1.isBlank()) put("line1", "Enter the street address.")
    if (city.isBlank()) put("city", "Enter a suburb or city.")
    if (postalCode.isBlank()) put("postalCode", "Enter a postcode.")
}

/** Form → the domain draft the repository persists. Trims and folds blanks to null. */
fun AddressForm.toDraft(): AddressDraft = AddressDraft(
    recipientName = recipientName.trim(),
    line1 = line1.trim(),
    city = city.trim(),
    postalCode = postalCode.trim(),
    label = resolveLabel(),
    phone = phone.trim().ifBlank { null },
    line2 = line2.trim().ifBlank { null },
    region = region.trim().ifBlank { null },
)

/** The chip's resolved label string (or null for NONE / a blank Other). */
private fun AddressForm.resolveLabel(): String? = when (labelChip) {
    LabelChip.NONE -> null
    LabelChip.HOME -> "Home"
    LabelChip.WORK -> "Work"
    LabelChip.OTHER -> otherLabel.trim().ifBlank { null }
}

/** A saved address → the pre-filled edit form (round-trips the label chip). */
fun SavedAddress.toForm(): AddressForm {
    val chip = when (label?.trim()) {
        null, "" -> LabelChip.NONE
        "Home" -> LabelChip.HOME
        "Work" -> LabelChip.WORK
        else -> LabelChip.OTHER
    }
    return AddressForm(
        labelChip = chip,
        otherLabel = if (chip == LabelChip.OTHER) label.orEmpty() else "",
        recipientName = recipientName,
        phone = phone.orEmpty(),
        line1 = line1,
        line2 = line2.orEmpty(),
        city = city,
        region = region.orEmpty(),
        postalCode = postalCode,
    )
}
