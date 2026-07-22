package com.effyshopping.customer.mobile.features.addresses.data

import com.effyshopping.customer.mobile.commerce.contract.AddressDTO
import com.effyshopping.customer.mobile.commerce.contract.CreateAddressRequest
import com.effyshopping.customer.mobile.commerce.contract.UpdateAddressRequest
import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress

// DTO ↔ domain for the address book (022). The generated DTOs (packages/shared-types/contract) never
// escape the data layer; a blank optional field is normalised to null on the way out.

internal fun AddressDTO.toDomain(): SavedAddress = SavedAddress(
    id = id,
    label = label,
    recipientName = recipientName,
    phone = phone,
    line1 = line1,
    line2 = line2,
    city = city,
    region = region,
    postalCode = postalCode,
    country = country,
    isDefault = isDefault,
)

// create: NEVER sends makeDefault — the backend auto-defaults only the customer's first address
// (FR-010); the deliberate per-row set-default is the only way to change it afterwards.
internal fun AddressDraft.toCreateRequest(): CreateAddressRequest = CreateAddressRequest(
    recipientName = recipientName,
    line1 = line1,
    line2 = line2,
    city = city,
    region = region,
    postalCode = postalCode,
    label = label,
    phone = phone,
)

// edit: sends the fields only — default status is left untouched unless set-default is used (FR-017).
internal fun AddressDraft.toUpdateRequest(): UpdateAddressRequest = UpdateAddressRequest(
    recipientName = recipientName,
    line1 = line1,
    line2 = line2,
    city = city,
    region = region,
    postalCode = postalCode,
    label = label,
    phone = phone,
)
